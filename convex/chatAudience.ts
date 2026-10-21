/** Who may see an existing work/duty thread. Same rules as the chat popups. */

import { isSameDepartmentSubordinate, isOperationalManagerRole, resolveUserMenuAccess, activePositionLevel } from "./lib";
import { canAccessDutyChat } from "./dutyMessagePolicy";
import { projectPublicDuty } from "./dutyApproval";
import { canAccessWorkChat } from "./workMessagePolicy";
import { moderatorDepartmentScope } from "./moderatorScope";

type UserRow = {
  _id: string;
  status?: string;
  role?: string;
  departmentId?: string;
  positionId?: string;
  permissionGroupId?: string;
  name?: string;
  email?: string;
};

function asAccessUser(user: UserRow) {
  return {
    role: String(user.role || "user"),
    permissionGroupId: user.permissionGroupId,
  };
}

export async function listDutyChatRecipientIds(
  ctx: any,
  args: {
    authorUserId: string;
    duty: any;
    users: UserRow[];
    positions: any[];
  },
) {
  const authorUserId = String(args.authorUserId || "");
  const recipientIds: string[] = [];
  // Teachers only reach a thread through the approved copy of the duty.
  const publicDuty = projectPublicDuty(args.duty);
  for (const candidate of args.users) {
    if (candidate.status !== "active" || String(candidate._id) === authorUserId) continue;
    const menuAccess = await resolveUserMenuAccess(ctx, asAccessUser(candidate));
    if (!isOperationalManagerRole(String(candidate.role || "")) && menuAccess.duties === "hidden") continue;
    const access = isOperationalManagerRole(String(candidate.role || ""))
      ? "view_all"
      : String(menuAccess.duties || "hidden");
    const subordinateUsers = isOperationalManagerRole(String(candidate.role || ""))
      ? []
      : args.users.filter(
          (target) =>
            target.status === "active" && isSameDepartmentSubordinate(candidate, target, args.positions),
        );
    if (
      !canAccessDutyChat({
        actorUserId: String(candidate._id),
        actorRole: String(candidate.role || ""),
        actorAccess: access,
        actorDepartmentId: candidate.departmentId,
        duty: isOperationalManagerRole(String(candidate.role || "")) ? args.duty : publicDuty,
        subordinateUsers,
      })
    ) {
      continue;
    }
    recipientIds.push(String(candidate._id));
  }
  return recipientIds;
}

export async function loadWorkChatRecords(ctx: any, documentId: string) {
  let document = null;
  try {
    document = await ctx.db.get(documentId);
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
  const usersById = new Map<string, UserRow>(users.map((user: UserRow) => [String(user._id), user]));
  return { document, workItems, personalTasks, usersById };
}

export async function listWorkChatRecipientIds(
  ctx: any,
  args: {
    authorUserId: string;
    document: any;
    workItems: any[];
    personalTasks: any[];
    users: UserRow[];
    usersById: Map<string, { status?: string }>;
    positions: any[];
    visibilityMode: any;
  },
) {
  const authorUserId = String(args.authorUserId || "");
  const recipientIds: string[] = [];
  for (const user of args.users) {
    if (user.status !== "active" || String(user._id) === authorUserId) continue;
    const menuAccess = await resolveUserMenuAccess(ctx, asAccessUser(user));
    if (!isOperationalManagerRole(String(user.role || "")) && menuAccess.work === "hidden") continue;
    if (
      !canAccessWorkChat({
        actorUserId: String(user._id),
        actorRole: String(user.role || "user"),
        actorLevel: isOperationalManagerRole(String(user.role || ""))
          ? 5
          : activePositionLevel(user, args.positions),
        actorDepartmentId: String(user.departmentId || ""),
        visibilityMode: args.visibilityMode,
        document: args.document,
        workItems: args.workItems,
        personalTasks: args.personalTasks,
        usersById: args.usersById,
        departmentScope: moderatorDepartmentScope(user),
      })
    ) {
      continue;
    }
    recipientIds.push(String(user._id));
  }
  return recipientIds;
}
