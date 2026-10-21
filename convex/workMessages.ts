import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  activePositionLevel,
  currentUserOrThrow,
  getWorkVisibilityMode,
  isOperationalManagerRole,
  resolveUserMenuAccess,
} from "./lib";
import {
  buildChatNotificationItem,
  canRecallChatMessage,
  evaluateChatRecall,
  isChatMessageRecalled,
  recallErrorCode,
} from "./chatMessagePolicy";
import { deactivateChatNotificationEvents, insertChatNotificationEvents } from "./chatNotifications";
import {
  canAccessWorkChat,
  prepareWorkMessageBody,
  sanitizeWorkMessageHtml,
  workChatAuthorInitials,
} from "./workMessagePolicy";
import { listWorkChatRecipientIds } from "./chatAudience";
import { applyChatRecall, publishChatMessage } from "./chatInbox";
import { clampChatPageLimit } from "./chatHubPolicy";
import { moderatorDepartmentScope } from "./moderatorScope";

async function requireWorkChatActor(ctx: any) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  if (!isOperationalManagerRole(user.role) && menuAccess.work === "hidden") {
    throw new Error("FORBIDDEN: work menu hidden");
  }
  const positions = await ctx.db.query("positions").collect();
  return {
    user,
    isAdmin: isOperationalManagerRole(user.role),
    level: isOperationalManagerRole(user.role) ? 5 : activePositionLevel(user, positions),
    positions,
  };
}

async function loadWorkChatContext(ctx: any, documentId: string) {
  let document = null;
  try {
    document = await ctx.db.get(documentId as Id<"officeDocuments">);
  } catch {
    document = null;
  }
  const workItems = (await ctx.db
    .query("workItems")
    .withIndex("by_document", (q: any) => q.eq("documentId", String(documentId)))
    .collect())
    .filter((item: any) => item.active);
  const personalTasks = [];
  for (const item of workItems) {
    const rows = await ctx.db
      .query("personalTasks")
      .withIndex("by_work_item", (q: any) => q.eq("workItemId", String(item._id)))
      .collect();
    for (const row of rows) {
      if (row.active) personalTasks.push(row);
    }
  }
  const users = await ctx.db.query("users").collect();
  const usersById = new Map<string, { status?: string; name?: string; email?: string }>(
    users.map((user: any) => [String(user._id), user]),
  );
  return { document, workItems, personalTasks, usersById };
}

async function authorizeWorkChat(ctx: any, documentId: string) {
  const actor = await requireWorkChatActor(ctx);
  const visibilityMode = await getWorkVisibilityMode(ctx);
  const { document, workItems, personalTasks, usersById } = await loadWorkChatContext(
    ctx,
    String(documentId || ""),
  );
  const allowed = canAccessWorkChat({
    actorUserId: String(actor.user._id),
    actorRole: actor.user.role,
    actorLevel: actor.level,
    actorDepartmentId: String(actor.user.departmentId || ""),
    visibilityMode,
    document,
    workItems,
    personalTasks,
    usersById,
    departmentScope: moderatorDepartmentScope(actor.user),
  });
  if (!allowed) throw new Error("WORK_CHAT_FORBIDDEN");
  return { actor, document, usersById };
}

function displayName(user: { name?: string; email?: string } | null | undefined) {
  const name = String(user?.name || "").trim();
  if (name) return name;
  const email = String(user?.email || "").trim();
  if (email) return email;
  return "Người dùng";
}

export const list = query({
  args: {
    documentId: v.string(),
    before: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { actor, document, usersById } = await authorizeWorkChat(ctx, args.documentId);
    const limit = clampChatPageLimit(args.limit);
    const rows = await ctx.db
      .query("workMessages")
      .withIndex("by_document_created", (q: any) => {
        const range = q.eq("documentId", String(args.documentId));
        return args.before ? range.lt("createdAt", args.before) : range;
      })
      .order("desc")
      .take(limit + 1);
    const hasMore = rows.length > limit;
    const now = Date.now();
    const messages = [...rows]
      .slice(0, limit)
      .filter((row: any) => row.active)
      .reverse()
      .map((row: any) => {
        const author = usersById.get(String(row.authorUserId));
        const authorName = displayName(author);
        const recalled = isChatMessageRecalled(row);
        const isSelf = String(row.authorUserId) === String(actor.user._id);
        return {
          _id: row._id,
          authorUserId: row.authorUserId,
          authorName,
          authorInitials: workChatAuthorInitials(authorName),
          bodyHtml: recalled ? "" : sanitizeWorkMessageHtml(row.bodyHtml),
          createdAt: row.createdAt,
          recalled,
          canRecall: canRecallChatMessage({
            actorUserId: String(actor.user._id),
            authorUserId: String(row.authorUserId),
            createdAt: row.createdAt,
            recalledAt: row.recalledAt,
            now,
          }),
          isSelf,
        };
      });
    return {
      documentId: String(document._id),
      documentTitle: String(document.title || document.fileName || document.content || "Công việc"),
      currentUserId: String(actor.user._id),
      hasMore,
      messages,
    };
  },
});

export const create = mutation({
  args: {
    documentId: v.string(),
    bodyHtml: v.string(),
  },
  handler: async (ctx, args) => {
    const { actor } = await authorizeWorkChat(ctx, args.documentId);
    const prepared = prepareWorkMessageBody(args.bodyHtml);
    const now = Date.now();
    const messageId = await ctx.db.insert("workMessages", {
      documentId: String(args.documentId),
      authorUserId: String(actor.user._id),
      bodyHtml: prepared.bodyHtml,
      bodyText: prepared.bodyText,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const { document, workItems, personalTasks, usersById } = await loadWorkChatContext(
      ctx,
      String(args.documentId),
    );
    const visibilityMode = await getWorkVisibilityMode(ctx);
    const recipientIds = await listWorkChatRecipientIds(ctx, {
      authorUserId: String(actor.user._id),
      document,
      workItems,
      personalTasks,
      users: [...usersById.values()] as any[],
      usersById,
      positions: actor.positions,
      visibilityMode,
    });
    await publishChatMessage(ctx, {
      kind: "work",
      entityId: String(args.documentId),
      title: String(document?.title || document?.fileName || "Công việc"),
      bodyText: prepared.bodyText,
      createdAt: now,
      authorUserId: String(actor.user._id),
      recipientIds,
    });
    if (recipientIds.length) {
      const feedItem = buildChatNotificationItem({
        kind: "work",
        messageId: String(messageId),
        entityId: String(args.documentId),
        entityTitle: String(document?.title || document?.fileName || "Công việc"),
        authorName: displayName(actor.user),
        bodyText: prepared.bodyText,
        createdAt: now,
      });
      await insertChatNotificationEvents(ctx, {
        recipientUserIds: recipientIds,
        kind: "work",
        sourceId: String(args.documentId),
        messageId: String(messageId),
        title: feedItem.title,
        description: feedItem.description,
        createdAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
        userIds: recipientIds,
        title: feedItem.title,
        body: feedItem.description,
        kind: "work",
        sourceType: "work_chat",
        sourceId: String(args.documentId),
      });
    }
    return { messageId };
  },
});

export const recall = mutation({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    let row = null;
    try {
      row = await ctx.db.get(args.messageId as Id<"workMessages">);
    } catch {
      row = null;
    }
    if (!row?.active) throw new Error("WORK_CHAT_RECALL_FORBIDDEN");
    const { actor } = await authorizeWorkChat(ctx, String(row.documentId));
    const decision = evaluateChatRecall({
      actorUserId: String(actor.user._id),
      authorUserId: String(row.authorUserId),
      createdAt: row.createdAt,
      recalledAt: row.recalledAt,
    });
    if (!decision.ok) throw new Error(recallErrorCode("work", decision.code));
    const now = Date.now();
    await ctx.db.patch(row._id, { recalledAt: now, updatedAt: now });
    await deactivateChatNotificationEvents(ctx, String(row._id));
    await applyChatRecall(ctx, {
      kind: "work",
      entityId: String(row.documentId),
      messageCreatedAt: row.createdAt,
      authorUserId: String(row.authorUserId),
    });
    return { recalled: true };
  },
});
