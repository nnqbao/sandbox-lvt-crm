/** Pure work-chat authorization and HTML sanitization. No Convex server imports. */

import {
  canSeeArchivedWork,
  canSeeLiveWork,
  isWorkItemArchived,
  type WorkVisibilityMode,
} from "./assignmentPolicy.ts";
import { isWorkDocumentInModeratorScope, workDocumentScopeAssignments } from "./moderatorScope.ts";

export const WORK_MESSAGE_TEXT_MAX_LENGTH = 4000;
export const WORK_MESSAGE_HTML_MAX_LENGTH = 20_000;

const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "ul", "ol", "li", "p", "br", "div"]);
const VOID_TAGS = new Set(["br"]);

type WorkChatWorkItem = {
  _id?: string;
  active?: boolean;
  assignmentType?: string;
  assigneeUserIds?: string[];
  departmentId?: string;
};

type WorkChatPersonalTask = {
  active?: boolean;
  assigneeUserIds?: string[];
  workItemId?: string;
};

function assignmentTypeOf(item: { assignmentType?: string }): "department" | "individual" {
  return item?.assignmentType === "individual" ? "individual" : "department";
}

function escapeText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      if (!Number.isFinite(n) || n < 32) return "";
      return String.fromCharCode(n);
    });
}

function styleWrapFromAttrs(attrs: string): string[] {
  const style = String(attrs || "");
  const wraps: string[] = [];
  if (/font-weight\s*:\s*(bold|[7-9]00)/i.test(style)) wraps.push("b");
  if (/font-style\s*:\s*(italic|oblique)/i.test(style)) wraps.push("i");
  if (/text-decoration[^;"']*underline/i.test(style)) wraps.push("u");
  return wraps;
}

/** Allow only basic rich-text tags produced by the web composer. */
export function sanitizeWorkMessageHtml(html: string): string {
  const source = String(html || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  let out = "";
  const openStack: string[] = [];
  const extraStack: string[][] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    out += escapeText(decodeText(source.slice(last, match.index)));
    last = match.index + match[0].length;
    const tag = match[1].toLowerCase();
    const closing = match[0].startsWith("</");
    const attrs = match[2] || "";
    if (tag === "span") {
      if (closing) {
        const wraps = extraStack.pop() || [];
        for (let i = wraps.length - 1; i >= 0; i -= 1) out += `</${wraps[i]}>`;
      } else {
        const wraps = styleWrapFromAttrs(attrs);
        extraStack.push(wraps);
        for (const wrap of wraps) out += `<${wrap}>`;
      }
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (VOID_TAGS.has(tag)) {
      if (!closing) out += "<br>";
      continue;
    }
    if (closing) {
      const idx = openStack.lastIndexOf(tag);
      if (idx === -1) continue;
      while (openStack.length > idx) {
        const popped = openStack.pop();
        if (popped) out += `</${popped}>`;
      }
    } else {
      openStack.push(tag);
      out += `<${tag}>`;
    }
  }
  out += escapeText(decodeText(source.slice(last)));
  while (extraStack.length) {
    const wraps = extraStack.pop() || [];
    for (let i = wraps.length - 1; i >= 0; i -= 1) out += `</${wraps[i]}>`;
  }
  while (openStack.length) {
    const popped = openStack.pop();
    if (popped) out += `</${popped}>`;
  }
  return out.replace(/(<br>\s*)+$/g, "").replace(/^(<br>\s*)+/g, "").trim();
}

export function workMessagePlainText(html: string): string {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function prepareWorkMessageBody(html: string): { bodyHtml: string; bodyText: string } {
  const raw = String(html || "");
  if (raw.length > WORK_MESSAGE_HTML_MAX_LENGTH) throw new Error("WORK_CHAT_TOO_LONG");
  const bodyHtml = sanitizeWorkMessageHtml(raw);
  if (bodyHtml.length > WORK_MESSAGE_HTML_MAX_LENGTH) throw new Error("WORK_CHAT_TOO_LONG");
  const bodyText = workMessagePlainText(bodyHtml);
  if (!bodyText) throw new Error("WORK_CHAT_EMPTY");
  if (bodyText.length > WORK_MESSAGE_TEXT_MAX_LENGTH) throw new Error("WORK_CHAT_TOO_LONG");
  return { bodyHtml, bodyText };
}

export function isWorkChatAssignee(args: {
  actorUserId: string;
  actorDepartmentId: string;
  workItems: WorkChatWorkItem[];
  personalTasks?: WorkChatPersonalTask[];
}): boolean {
  const actorUserId = String(args.actorUserId || "");
  const actorDepartmentId = String(args.actorDepartmentId || "");
  if (!actorUserId) return false;
  const activeItems = (args.workItems || []).filter((item) => item?.active !== false);
  if (
    activeItems.some((item) => {
      if (assignmentTypeOf(item) === "individual") {
        return (item.assigneeUserIds || []).some((id) => String(id) === actorUserId);
      }
      return Boolean(actorDepartmentId) && String(item.departmentId || "") === actorDepartmentId;
    })
  ) {
    return true;
  }
  const workItemIds = new Set(activeItems.map((item) => String(item._id || "")).filter(Boolean));
  return (args.personalTasks || []).some((task) => {
    if (task?.active === false) return false;
    if (workItemIds.size && task.workItemId && !workItemIds.has(String(task.workItemId))) return false;
    return (task.assigneeUserIds || []).some((id) => String(id) === actorUserId);
  });
}

/** Same visibility as a live work card: creator, assignee, and school-mode 4/5★ + admin/mod. */
export function canAccessWorkChat(args: {
  actorUserId: string;
  actorRole: string;
  actorLevel: number;
  actorDepartmentId: string;
  visibilityMode: WorkVisibilityMode;
  document: { active?: boolean; createdBy?: string; status?: string } | null | undefined;
  workItems: WorkChatWorkItem[];
  personalTasks?: WorkChatPersonalTask[];
  usersById?: Map<string, { status?: string; departmentId?: string }>;
  /** Department of a scoped moderator (`moderatorDepartmentScope`); null/undefined = unscoped. */
  departmentScope?: string | null;
}): boolean {
  const document = args.document;
  if (!document?.active) return false;
  const usersById = args.usersById || new Map();
  const inModeratorScope = isWorkDocumentInModeratorScope(
    args.departmentScope ?? null,
    workDocumentScopeAssignments(document as any),
    usersById,
  );
  const items = (args.workItems || []).filter((item) => item?.active !== false);
  const archived =
    items.some((item) => isWorkItemArchived(document, item, usersById)) ||
    isWorkItemArchived(document, { assignmentType: "department" }, usersById);
  if (archived) return canSeeArchivedWork(args.actorRole, inModeratorScope);
  const isAssignee = isWorkChatAssignee({
    actorUserId: args.actorUserId,
    actorDepartmentId: args.actorDepartmentId,
    workItems: items,
    personalTasks: args.personalTasks,
  });
  return canSeeLiveWork({
    actorUserId: args.actorUserId,
    actorRole: args.actorRole,
    actorLevel: args.actorLevel,
    createdBy: String(document.createdBy || ""),
    isAssignee,
    visibilityMode: args.visibilityMode,
    inModeratorScope,
  });
}

export function workChatAuthorInitials(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(-2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("") || "?";
}
