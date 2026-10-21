import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import {
  assignmentCreatorOrThrow,
  activePositionLevel,
  currentUserOrThrow,
  DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
  DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
  getBooleanSystemSetting,
  isOperationalManagerRole,
  isSameDepartmentSubordinate,
  resolveUserMenuAccess,
  canOperateMenu,
  type MenuAccess,
} from "./lib";
import {
  canCreateAssignments,
  dutyListTitle,
  dutyLocationLabel,
  dutyPushRecipientIds,
} from "./assignmentPolicy";
import { cleanDutyInput, evaluateDutyRefs, parseLocalMs } from "./dutyWritePolicy";
import { canAccessDutyChat } from "./dutyMessagePolicy";
import {
  dutyScheduleRevision,
  loadActiveDutiesOverlapping,
  loadDocsByIds,
  loadDutiesStartingBetween,
  loadPublicDutiesOverlapping,
  parseDutyDateRange,
} from "./dutyRange";
import {
  dutyHasPendingChange,
  dutyScopeForCreator,
  dutyWeekLastDay,
  dutyWeeksInRange,
  canReviewerEditDuty,
  isDutyWeekReviewer,
  isTeamDuty,
  legacySnapshotPatch,
  reviewerEditPatchForDuty,
  projectPublicDuty,
  publishedDutyFields,
  summarizeDutyWeek,
  weeksAffectedByDuty,
} from "./dutyApproval";
import {
  dutyViewerLevel,
  loadDutyWeekRecords,
  reopenSubmittedWeeks,
  resolveDutyScope,
} from "./dutyWeekStore";
import {
  buildDutyChangeDiff,
  canViewDutyChangeHistory,
  DUTY_ACTOR_KIND_LABELS,
  DUTY_CHANGE_ACTION_LABELS,
  dutyLogReferencedIds,
  dutyWriterKind,
  formatDutyLogTimestamp,
  type DutyActorKind,
  type DutyChangeAction,
  type DutyLogFields,
} from "./dutyChangeLog";

/** Field-level history row; names are resolved now so the log stays readable later. */
export async function writeDutyChangeLog(
  ctx: { db: any },
  args: {
    dutyId: any;
    actorUserId: string;
    actorKind: DutyActorKind;
    action: DutyChangeAction;
    before: DutyLogFields | null;
    after: DutyLogFields | null;
    at: number;
  },
) {
  const refs = dutyLogReferencedIds(args.before, args.after);
  const [departments, users] = await Promise.all([
    loadDocsByIds(ctx, refs.departmentIds),
    loadDocsByIds(ctx, refs.userIds),
  ]);
  const changes = buildDutyChangeDiff(args.before, args.after, {
    departments: new Map(departments.map((row: any) => [String(row._id), String(row.name || row.code || "")])),
    users: new Map(users.map((row: any) => [String(row._id), String(row.name || row.email || "")])),
  });
  await ctx.db.insert("dutyChangeLogs", {
    dutyId: args.dutyId,
    actorUserId: String(args.actorUserId),
    actorKind: args.actorKind,
    action: args.action,
    at: args.at,
    changes,
  });
}

async function assertRefs(
  ctx: { db: any },
  input: {
    departmentIds: string[];
    participantUserIds: string[];
    otherParticipants?: string;
  },
  actor: { user: any; isOps: boolean; positions: any[] },
) {
  const departments = input.departmentIds.length ? await ctx.db.query("departments").collect() : [];
  const users = input.participantUserIds.length ? await ctx.db.query("users").collect() : [];
  const error = evaluateDutyRefs(input, actor, { departments, users });
  if (error) throw new Error(error);
}

export async function requireDutyWrite(ctx: any) {
  const actor = await assignmentCreatorOrThrow(ctx);
  if (actor.isOps) return actor;
  const menuAccess = await resolveUserMenuAccess(ctx, actor.user);
  if ((menuAccess.duties || "hidden") === "hidden") {
    throw new Error("FORBIDDEN: duties menu hidden");
  }
  return actor;
}

export async function insertCreatedDuty(
  ctx: any,
  actor: { user: { _id: string }; isOps: boolean },
  input: {
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
    title: string;
    content: string;
    locationText: string;
    locationIds: string[];
    departmentIds: string[];
    participantUserIds: string[];
    otherParticipants: string;
  },
  logAction: "create" | "import" = "create",
) {
  const now = Date.now();
  const scope = dutyScopeForCreator(actor.isOps);
  const id = await ctx.db.insert("duties", {
    ...input,
    active: true,
    scope,
    ...(scope === "school" ? { approvalTracked: true } : {}),
    createdBy: actor.user._id,
    updatedBy: actor.user._id,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("auditLogs", {
    actorUserId: actor.user._id,
    action: "duty.create",
    details: JSON.stringify({ id, title: input.title, content: input.content }),
    at: now,
  });
  await writeDutyChangeLog(ctx, {
    dutyId: id,
    actorUserId: String(actor.user._id),
    actorKind: dutyWriterKind(actor.isOps),
    action: logAction,
    before: null,
    after: input,
    at: now,
  });
  if (scope === "school") {
    // Teachers hear about it once BGH approves the week.
    await reopenSubmittedWeeks(ctx, weeksAffectedByDuty(null, { ...input, _id: String(id), scope, active: true, approvalTracked: true, createdAt: now, updatedAt: now }), String(actor.user._id), now);
    return id;
  }
  await scheduleDutyPush(ctx, {
    dutyId: String(id),
    title: "Công tác mới",
    body: dutyListTitle(input),
    departmentIds: input.departmentIds,
    participantUserIds: input.participantUserIds,
  });
  return id;
}

async function scheduleDutyPush(
  ctx: any,
  args: {
    dutyId: string;
    title: string;
    body: string;
    departmentIds: string[];
    participantUserIds: string[];
  },
) {
  const users = (await ctx.db.query("users").collect()).filter((row: any) => row.status === "active");
  const userIds = dutyPushRecipientIds({
    departmentIds: args.departmentIds,
    participantUserIds: args.participantUserIds,
    users,
  });
  if (!userIds.length) return;
  await ctx.scheduler.runAfter(0, internal.pushActions.sendToUsers, {
    userIds,
    title: args.title,
    body: args.body,
    kind: "duty",
    sourceType: "duty_assigned",
    sourceId: String(args.dutyId),
  });
}

function canMutateDuty(actor: { user: any; isOps: boolean }, duty: { createdBy?: string }) {
  if (actor.isOps) return true;
  return String(duty.createdBy || "") === String(actor.user._id);
}

function userIsParticipant(
  user: { _id: string; departmentId?: string },
  duty: { departmentIds: string[]; participantUserIds: string[] },
): boolean {
  const userId = String(user._id);
  if (duty.participantUserIds.some((id) => String(id) === userId)) return true;
  if (user.departmentId && duty.departmentIds.some((id) => String(id) === String(user.departmentId))) {
    return true;
  }
  return false;
}

function resolveParticipantUsers(
  users: any[],
  duty: { departmentIds: string[]; participantUserIds: string[] },
) {
  return users
    .filter((u) => u.status === "active" && userIsParticipant(u, duty))
    .sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "vi"));
}

function deadlineMs(duty: { endDate: string; endTime: string }) {
  return parseLocalMs(duty.endDate, duty.endTime);
}

function startMs(duty: { startDate: string; startTime: string }) {
  return parseLocalMs(duty.startDate, duty.startTime);
}

export function dutyTiming(duty: { startDate: string; startTime: string; endDate: string; endTime: string }, now = Date.now()) {
  const start = startMs(duty);
  const end = deadlineMs(duty);
  const isOngoing = now >= start && now <= end;
  const isOverdue = now > end;
  const isUpcoming = now < start;
  const msToEnd = end - now;
  // Near deadline only when upcoming (within 24h of end), never while ongoing or overdue.
  const nearDeadline =
    isUpcoming && msToEnd >= 0 && msToEnd <= 24 * 60 * 60 * 1000;
  return { start, end, isOngoing, isOverdue, isUpcoming, nearDeadline, msToEnd };
}

function mapNames(ids: string[], rows: { _id: string; name: string }[]) {
  const map = new Map(rows.map((r) => [String(r._id), r.name]));
  return ids.map((id) => map.get(String(id))).filter((name): name is string => Boolean(name));
}

export async function requireDutiesAccess(ctx: any) {
  const user = await currentUserOrThrow(ctx);
  if (user.status !== "active") throw new Error("USER_NOT_ACTIVE");
  if (user.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
  const menuAccess = await resolveUserMenuAccess(ctx, user);
  const access = (menuAccess.duties || "hidden") as MenuAccess;
  if (isOperationalManagerRole(user.role)) {
    return { user, access: "view_all" as MenuAccess, isAdmin: true };
  }
  if (access === "hidden") throw new Error("FORBIDDEN: duties menu hidden");
  return { user, access, isAdmin: false };
}

export const formOptions = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireDutyWrite(ctx);
    const [departments, users] = await Promise.all([
      ctx.db.query("departments").collect(),
      ctx.db.query("users").collect(),
    ]);
    const assignableUsers = users
      .filter((u) => {
        if (u.status !== "active") return false;
        if (actor.isOps) return true;
        return isSameDepartmentSubordinate(actor.user, u, actor.positions);
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"))
      .map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        departmentId: u.departmentId,
      }));
    return {
      canCreate: true,
      isOps: actor.isOps,
      locations: [],
      departments: actor.isOps
        ? departments
            .filter((d) => d.active)
            .sort((a, b) => a.name.localeCompare(b.name, "vi"))
            .map((d) => ({ _id: d._id, name: d.name, code: d.code }))
        : [],
      users: assignableUsers,
    };
  },
});

export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireDutyWrite(ctx);
    if (!actor.isOps) throw new Error("FORBIDDEN: operational manager role required");
    const [duties, locations, departments, users, attendances, attendanceConfirmationEnabled] = await Promise.all([
      ctx.db.query("duties").collect(),
      ctx.db.query("locations").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("dutyAttendances").collect(),
      getBooleanSystemSetting(
        ctx,
        DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
        DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
      ),
    ]);

    const activeDuties = duties.filter((d) => d.active);
    const now = Date.now();
    const attByDuty = new Map<string, any[]>();
    for (const a of attendances) {
      const list = attByDuty.get(a.dutyId) || [];
      list.push(a);
      attByDuty.set(a.dutyId, list);
    }

    return {
      attendanceConfirmationEnabled,
      duties: activeDuties
        .map((duty) => {
        const timing = dutyTiming(duty, now);
        const participants = resolveParticipantUsers(users, duty);
        const attMap = new Map((attByDuty.get(duty._id) || []).map((a) => [a.userId, a.status]));
        return {
          ...duty,
          locationNames: [dutyLocationLabel(duty, mapNames(duty.locationIds, locations))].filter(Boolean),
          departmentNames: mapNames(duty.departmentIds, departments),
          participantNames: participants.map((u) => u.name || u.email || u._id),
          timing: {
            isOngoing: timing.isOngoing,
            isOverdue: timing.isOverdue,
            nearDeadline: timing.nearDeadline,
            isUpcoming: timing.isUpcoming,
            deadlineMs: timing.end,
          },
          participants: participants.map((u) => ({
            _id: u._id,
            name: u.name,
            email: u.email,
            departmentId: u.departmentId,
            status: (attMap.get(u._id) as string) || (attendanceConfirmationEnabled ? "pending" : "attended"),
          })),
        };
      })
      .sort((a, b) => a.timing.deadlineMs - b.timing.deadlineMs),
    };
  },
});

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const { user, access, isAdmin } = await requireDutiesAccess(ctx);
    const [rawDuties, locations, departments, users, positions, attendances, attendanceConfirmationEnabled] = await Promise.all([
      ctx.db.query("duties").collect(),
      ctx.db.query("locations").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("positions").collect(),
      ctx.db.query("dutyAttendances").collect(),
      getBooleanSystemSetting(
        ctx,
        DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
        DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
      ),
    ]);

    // Personal lists (web and the native apps) only ever show approved copies.
    const duties = rawDuties.map((duty) => projectPublicDuty(duty)).filter((duty) => duty !== null);
    const attMap = new Map(attendances.map((a) => [`${String(a.dutyId)}:${String(a.userId)}`, a.status]));
    const canEdit = isAdmin || canOperateMenu(access);
    const canViewAll = !isAdmin && access === "view_all";
    const actorLevel = activePositionLevel(user, positions);
    const subordinateUsers = users.filter(
      (target) => target.status === "active" && isSameDepartmentSubordinate(user, target, positions),
    );
    const subordinateIds = new Set(subordinateUsers.map((target) => String(target._id)));
    const now = Date.now();
    const userNameMap = new Map(users.map((u) => [String(u._id), String(u.name || u.email || u._id)]));
    const positionNameMap = new Map(positions.map((position) => [String(position._id), String(position.name || "")]));
    const departmentNameMap = new Map(
      departments.map((department) => [String(department._id), String(department.name || "")]),
    );

    const mine = duties.filter((d) => {
      if (!d.active) return false;
      if (isAdmin || canViewAll) return true;
      if (String(d.createdBy || "") === String(user._id)) return true;
      return [user, ...subordinateUsers].some((visibleUser) => userIsParticipant(visibleUser, d));
    });
    return {
      canEdit,
      canCreate: canCreateAssignments(user.role, actorLevel),
      isAdmin,
      access,
      canViewAll,
      attendanceConfirmationEnabled,
      canManageSubordinates: attendanceConfirmationEnabled && !isAdmin && canEdit && actorLevel > 0,
      departmentId: user.departmentId || null,
      positionLevel: actorLevel,
      duties: mine
        .map((duty) => {
          const timing = dutyTiming(duty, now);
          const participants = resolveParticipantUsers(users, duty);
          const isMine = userIsParticipant(user, duty);
          const subordinateParticipants = participants
            .filter((participant) => subordinateIds.has(String(participant._id)))
            .map((participant) => ({
              _id: participant._id,
              name: participant.name,
              email: participant.email,
              departmentId: participant.departmentId,
              positionId: participant.positionId,
              positionLevel: activePositionLevel(participant, positions),
              positionName: positionNameMap.get(String(participant.positionId)) || "",
              status:
                (attMap.get(`${String(duty._id)}:${String(participant._id)}`) as string) ||
                (attendanceConfirmationEnabled ? "pending" : "attended"),
            }));
          const visibleParticipants = canViewAll
            ? participants.map((participant) => ({
                _id: participant._id,
                name: participant.name,
                email: participant.email,
                departmentName:
                  departmentNameMap.get(String(participant.departmentId)) || "Chưa gán phòng ban",
                positionName: positionNameMap.get(String(participant.positionId)) || "",
                status:
                  (attMap.get(`${String(duty._id)}:${String(participant._id)}`) as string) ||
                  (attendanceConfirmationEnabled ? "pending" : "attended"),
              }))
            : [];
          return {
            _id: duty._id,
            startDate: duty.startDate,
            endDate: duty.endDate,
            startTime: duty.startTime,
            endTime: duty.endTime,
            allDay: duty.allDay,
            createdAt: duty.createdAt,
            createdBy: duty.createdBy,
            title: duty.title,
            content: duty.content,
            locationText: duty.locationText || dutyLocationLabel(duty, mapNames(duty.locationIds, locations)),
            locationNames: [dutyLocationLabel(duty, mapNames(duty.locationIds, locations))].filter(Boolean),
            departmentIds: duty.departmentIds,
            participantUserIds: duty.participantUserIds,
            canManage: isAdmin || String(duty.createdBy || "") === String(user._id),
            departmentNames: mapNames(duty.departmentIds, departments),
            departmentParticipants: duty.departmentIds.map((departmentId) => ({
              departmentName:
                departmentNameMap.get(String(departmentId)) || "Chưa gán phòng ban",
              participantNames: users
                .filter(
                  (candidate) =>
                    candidate.status === "active" &&
                    String(candidate.departmentId || "") === String(departmentId),
                )
                .map((candidate) => String(candidate.name || candidate.email || ""))
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, "vi")),
            })),
            participantNames: duty.participantUserIds
              .map((id) => userNameMap.get(String(id)))
              .filter((name): name is string => Boolean(name)),
            otherParticipants: String(duty.otherParticipants || "").trim(),
            // For user view: show individual assignees as selected; department members implied by dept list
            myStatus:
              (attMap.get(`${String(duty._id)}:${String(user._id)}`) as string) ||
              (attendanceConfirmationEnabled ? "pending" : "attended"),
            isMine,
            subordinateParticipants,
            visibleParticipants,
            timing: {
              isOngoing: timing.isOngoing,
              isOverdue: timing.isOverdue,
              nearDeadline: timing.nearDeadline,
              isUpcoming: timing.isUpcoming,
              deadlineMs: timing.end,
              canMarkAttendance: attendanceConfirmationEnabled && timing.isOngoing,
            },
            participantCount: participants.length,
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt),
    };
  },
});

async function loadScheduleSubordinates(
  ctx: { db: any },
  user: { _id: string; departmentId?: string; positionId?: string },
  isAdmin: boolean,
  access: string,
) {
  if (isAdmin || access === "view_all" || !user.departmentId) return [];
  const departmentUsers = await ctx.db
    .query("users")
    .withIndex("by_department", (q: any) => q.eq("departmentId", String(user.departmentId)))
    .collect();
  const positions = await loadDocsByIds(ctx, [
    user.positionId,
    ...departmentUsers.map((row: { positionId?: string }) => row.positionId),
  ]);
  return departmentUsers.filter(
    (target: { status?: string; _id: string; departmentId?: string; positionId?: string }) =>
      target.status === "active" && isSameDepartmentSubordinate(user, target, positions),
  );
}

type SharedScheduleViewer = "manager" | "reviewer" | "public";

/**
 * Văn thư (admin/mod) and BGH see the working sheet with its approval state.
 * Everybody else sees only approved copies. Team-lead rows never appear here.
 */
async function loadSharedScheduleSlice(
  ctx: any,
  user: any,
  isAdmin: boolean,
  startDate: string,
  endDate: string,
) {
  const positions = await loadDocsByIds(ctx, [user.positionId]);
  const viewer: SharedScheduleViewer = isAdmin
    ? "manager"
    : isDutyWeekReviewer(user, activePositionLevel(user, positions))
      ? "reviewer"
      : "public";
  if (viewer === "public") {
    const duties = (await loadPublicDutiesOverlapping(ctx, startDate, endDate)).filter((duty) => !isTeamDuty(duty));
    return { viewer, duties, weekRows: [] as any[], weekRecords: [] as any[], weeks: [] as string[] };
  }
  const weeks = dutyWeeksInRange(startDate, endDate);
  const [live, weekRows, weekRecords] = await Promise.all([
    loadActiveDutiesOverlapping(ctx, startDate, endDate),
    loadDutiesStartingBetween(ctx, weeks[0], dutyWeekLastDay(weeks[weeks.length - 1])),
    loadDutyWeekRecords(ctx, weeks[0], weeks[weeks.length - 1]),
  ]);
  return {
    viewer,
    duties: live.filter((duty) => !isTeamDuty(duty)),
    weekRows: weekRows.filter((duty) => !isTeamDuty(duty)),
    weekRecords,
    weeks,
  };
}

function sharedScheduleStamp(
  slice: { viewer: string; duties: any[]; weekRows: any[]; weekRecords: any[] },
  user: { _id: string; role?: string; departmentId?: string; permissionGroupId?: string; positionId?: string; updatedAt?: number },
  access: string,
  isAdmin: boolean,
) {
  return dutyScheduleRevision({
    duties: [...slice.duties, ...slice.weekRows],
    meta: [
      access,
      isAdmin ? "ops" : "member",
      slice.viewer,
      String(user._id),
      String(user.role || ""),
      String(user.departmentId || ""),
      String(user.permissionGroupId || ""),
      String(user.positionId || ""),
      String(Number(user.updatedAt) || 0),
      slice.weekRecords.map((row) => `${row.weekStart}:${row.status}:${row.updatedAt}`).sort().join(","),
    ].join("|"),
  });
}

/** School-wide Lịch công tác sheet for anyone who can open the duties menu. */
export const sharedSchedule = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const { startDate, endDate } = parseDutyDateRange(args.startDate, args.endDate);
    const { user, access, isAdmin } = await requireDutiesAccess(ctx);
    const slice = await loadSharedScheduleSlice(ctx, user, isAdmin, startDate, endDate);
    const duties = slice.duties;
    const weekUserIds = slice.weekRecords.flatMap((row) => [row.submittedBy, row.returnedBy, row.approvedBy]);
    const [locations, departments, participantUsers, subordinateUsers, weekUsers] = await Promise.all([
      loadDocsByIds(ctx, duties.flatMap((duty) => duty.locationIds || [])),
      loadDocsByIds(ctx, duties.flatMap((duty) => duty.departmentIds || [])),
      loadDocsByIds(ctx, duties.flatMap((duty) => duty.participantUserIds || [])),
      loadScheduleSubordinates(ctx, user, isAdmin, access),
      loadDocsByIds(ctx, weekUserIds),
    ]);
    const userNameMap = new Map(
      [...participantUsers, ...weekUsers].map((row) => [String(row._id), String(row.name || row.email || "")]),
    );
    const events = duties
      .map((duty) => {
        const chatDuty = isAdmin ? duty : projectPublicDuty(duty);
        const pending = slice.viewer === "public" ? false : dutyHasPendingChange(duty);
        return {
          _id: duty._id,
          title: dutyListTitle(duty),
          content: duty.content,
          startDate: duty.startDate,
          endDate: duty.endDate,
          startTime: duty.startTime,
          endTime: duty.endTime,
          allDay: duty.allDay,
          location: dutyLocationLabel(duty, mapNames(duty.locationIds, locations)),
          locationText: duty.locationText || dutyLocationLabel(duty, mapNames(duty.locationIds, locations)),
          departmentIds: duty.departmentIds || [],
          participantUserIds: duty.participantUserIds || [],
          departmentNames: mapNames(duty.departmentIds, departments),
          participantNames: duty.participantUserIds
            .map((id) => userNameMap.get(String(id)))
            .filter((name): name is string => Boolean(name)),
          otherParticipants: String(duty.otherParticipants || "").trim(),
          createdAt: duty.createdAt,
          updatedAt: duty.updatedAt,
          approvalChange: pending ? (publishedDutyFields(duty) ? "changed" : "added") : null,
          canManage: isAdmin || String(duty.createdBy || "") === String(user._id),
          // Rows here are never team rows; reviewerUpdate re-checks scope server-side.
          canReviewerEdit: slice.viewer === "reviewer" && duty.active !== false,
          canViewHistory: slice.viewer !== "public" || String(duty.createdBy || "") === String(user._id),
          canChat: canAccessDutyChat({
            actorUserId: String(user._id),
            actorRole: String(user.role || ""),
            actorAccess: String(access || ""),
            actorDepartmentId: user.departmentId,
            duty: chatDuty,
            subordinateUsers,
          }),
        };
      })
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          a.startTime.localeCompare(b.startTime) ||
          a.title.localeCompare(b.title, "vi"),
      );
    const recordsByWeek = new Map(slice.weekRecords.map((row) => [row.weekStart, row]));
    const weeks = slice.weeks.map((weekStart) => {
      const summary = summarizeDutyWeek(weekStart, slice.weekRows, recordsByWeek.get(weekStart));
      const nameOf = (id?: string) => (id ? userNameMap.get(String(id)) || "" : "");
      return {
        ...summary,
        submittedByName: nameOf(summary.submittedBy),
        returnedByName: nameOf(summary.returnedBy),
        approvedByName: nameOf(summary.approvedBy),
      };
    });
    return {
      startDate,
      endDate,
      viewer: slice.viewer,
      canSubmit: slice.viewer === "manager",
      canReview: slice.viewer === "reviewer",
      weeks,
      revision: sharedScheduleStamp(slice, user, access, isAdmin),
      events,
    };
  },
});

/**
 * Cheap stamp for the shared Lịch công tác window.
 * Reads the same duty slice as `sharedSchedule` and skips location, department,
 * and participant joins so a browser cache can skip the heavy query when unchanged.
 */
export const sharedScheduleRevision = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const { startDate, endDate } = parseDutyDateRange(args.startDate, args.endDate);
    const { user, access, isAdmin } = await requireDutiesAccess(ctx);
    const slice = await loadSharedScheduleSlice(ctx, user, isAdmin, startDate, endDate);
    return {
      startDate,
      endDate,
      revision: sharedScheduleStamp(slice, user, access, isAdmin),
    };
  },
});

export const create = mutation({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.boolean(),
    title: v.string(),
    content: v.string(),
    locationText: v.string(),
    departmentIds: v.array(v.string()),
    participantUserIds: v.array(v.string()),
    otherParticipants: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireDutyWrite(ctx);
    const input = cleanDutyInput(args);
    await assertRefs(ctx, input, actor);
    return await insertCreatedDuty(ctx, actor, input);
  },
});

export const update = mutation({
  args: {
    id: v.id("duties"),
    startDate: v.string(),
    endDate: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.boolean(),
    title: v.string(),
    content: v.string(),
    locationText: v.string(),
    departmentIds: v.array(v.string()),
    participantUserIds: v.array(v.string()),
    otherParticipants: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireDutyWrite(ctx);
    const current = await ctx.db.get(args.id);
    if (!current || !current.active) throw new Error("DUTY_NOT_FOUND");
    if (!canMutateDuty(actor, current)) throw new Error("DUTY_UPDATE_FORBIDDEN");
    const input = cleanDutyInput(args);
    const scope = await resolveDutyScope(ctx, current);
    await assertRefs(ctx, input, actor);
    const now = Date.now();
    if (scope === "school") {
      const patch = {
        ...legacySnapshotPatch({ ...current, scope }, now),
        ...input,
        scope,
        approvalTracked: true,
        updatedBy: actor.user._id,
        updatedAt: now,
      };
      await ctx.db.patch(args.id, patch);
      await ctx.db.insert("auditLogs", {
        actorUserId: actor.user._id,
        action: "duty.update",
        details: JSON.stringify({ id: args.id, title: input.title, content: input.content }),
        at: now,
      });
      await writeDutyChangeLog(ctx, {
        dutyId: args.id,
        actorUserId: String(actor.user._id),
        actorKind: dutyWriterKind(actor.isOps),
        action: "update",
        before: current,
        after: input,
        at: now,
      });
      const before = { ...current, scope };
      const after = { ...current, ...patch };
      await reopenSubmittedWeeks(ctx, weeksAffectedByDuty(before, after), String(actor.user._id), now);
      return;
    }
    await ctx.db.patch(args.id, {
      ...input,
      scope,
      updatedBy: actor.user._id,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "duty.update",
      details: JSON.stringify({ id: args.id, title: input.title, content: input.content }),
      at: now,
    });
    await writeDutyChangeLog(ctx, {
      dutyId: args.id,
      actorUserId: String(actor.user._id),
      actorKind: dutyWriterKind(actor.isOps),
      action: "update",
      before: current,
      after: input,
      at: now,
    });
    await scheduleDutyPush(ctx, {
      dutyId: String(args.id),
      title: "Công tác đã cập nhật",
      body: dutyListTitle(input),
      departmentIds: input.departmentIds,
      participantUserIds: input.participantUserIds,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("duties") },
  handler: async (ctx, args) => {
    const actor = await requireDutyWrite(ctx);
    const current = await ctx.db.get(args.id);
    if (!current) throw new Error("DUTY_NOT_FOUND");
    if (!canMutateDuty(actor, current)) throw new Error("DUTY_UPDATE_FORBIDDEN");
    if (!current.active) return;
    const now = Date.now();
    const scope = await resolveDutyScope(ctx, current);
    // A school row keeps its approved copy, so teachers still see it until BGH approves the delete.
    const patch =
      scope === "school"
        ? { ...legacySnapshotPatch({ ...current, scope }, now), scope, approvalTracked: true }
        : { scope };
    await ctx.db.patch(args.id, { ...patch, active: false, updatedAt: now, updatedBy: actor.user._id });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "duty.remove",
      details: JSON.stringify({ id: args.id }),
      at: now,
    });
    await writeDutyChangeLog(ctx, {
      dutyId: args.id,
      actorUserId: String(actor.user._id),
      actorKind: dutyWriterKind(actor.isOps),
      action: "remove",
      before: current,
      after: null,
      at: now,
    });
    if (scope === "school") {
      const after = { ...current, ...patch, active: false };
      await reopenSubmittedWeeks(ctx, weeksAffectedByDuty({ ...current, scope }, after), String(actor.user._id), now);
    }
  },
});

async function requireDutyReviewer(ctx: any) {
  const access = await requireDutiesAccess(ctx);
  const level = await dutyViewerLevel(ctx, access.user);
  if (!isDutyWeekReviewer(access.user, level)) throw new Error("DUTY_REVIEWER_EDIT_FORBIDDEN");
  return { ...access, level };
}

async function loadReviewerEditableDuty(ctx: any, actor: { user: any; level: number }, id: any) {
  const current = await ctx.db.get(id);
  if (!current || !current.active) throw new Error("DUTY_NOT_FOUND");
  const scope = await resolveDutyScope(ctx, current);
  if (!canReviewerEditDuty(actor.user, actor.level, { ...current, scope })) {
    throw new Error("DUTY_REVIEWER_EDIT_FORBIDDEN");
  }
  return { current, scope };
}

/** Working copy + catalogs for the BGH editor (BGH picks any department/user, like văn thư). */
export const reviewerEditContext = query({
  args: { id: v.id("duties") },
  handler: async (ctx, args) => {
    const actor = await requireDutyReviewer(ctx);
    const { current } = await loadReviewerEditableDuty(ctx, actor, args.id);
    const [departments, users] = await Promise.all([
      ctx.db.query("departments").collect(),
      ctx.db.query("users").collect(),
    ]);
    return {
      duty: {
        _id: current._id,
        startDate: current.startDate,
        endDate: current.endDate,
        startTime: current.startTime,
        endTime: current.endTime,
        allDay: current.allDay,
        title: current.title || "",
        content: current.content,
        locationText: current.locationText || "",
        departmentIds: current.departmentIds || [],
        participantUserIds: current.participantUserIds || [],
        otherParticipants: current.otherParticipants || "",
      },
      departments: departments
        .filter((d) => d.active)
        .sort((a, b) => a.name.localeCompare(b.name, "vi"))
        .map((d) => ({ _id: d._id, name: d.name, code: d.code })),
      users: users
        .filter((u) => u.status === "active")
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi"))
        .map((u) => ({ _id: u._id, name: u.name, email: u.email, departmentId: u.departmentId })),
    };
  },
});

/**
 * BGH edits a school duty directly. No create/delete here, and no week reopen:
 * see `reviewerEditPatchForDuty` for how the approved copy follows the edit.
 */
export const reviewerUpdate = mutation({
  args: {
    id: v.id("duties"),
    startDate: v.string(),
    endDate: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    allDay: v.boolean(),
    title: v.string(),
    content: v.string(),
    locationText: v.string(),
    departmentIds: v.array(v.string()),
    participantUserIds: v.array(v.string()),
    otherParticipants: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireDutyReviewer(ctx);
    const { current, scope } = await loadReviewerEditableDuty(ctx, actor, args.id);
    const input = cleanDutyInput(args);
    // Same validation as văn thư: any active department/user, participants optional.
    await assertRefs(ctx, input, { user: actor.user, isOps: true, positions: [] });
    const now = Date.now();
    const change = reviewerEditPatchForDuty({ ...current, _id: String(current._id), scope } as any, input, now);
    await ctx.db.patch(args.id, {
      ...change.patch,
      updatedBy: actor.user._id,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "duty.reviewer_edit",
      details: JSON.stringify({ id: args.id, title: input.title, content: input.content, published: change.publishes }),
      at: now,
    });
    await writeDutyChangeLog(ctx, {
      dutyId: args.id,
      actorUserId: String(actor.user._id),
      actorKind: "reviewer",
      action: "reviewer_edit",
      before: current,
      after: input,
      at: now,
    });
    if (change.publishes) {
      // Same push teachers get when BGH approves an updated row.
      await scheduleDutyPush(ctx, {
        dutyId: String(args.id),
        title: "Công tác đã cập nhật",
        body: dutyListTitle(input),
        departmentIds: input.departmentIds,
        participantUserIds: input.participantUserIds,
      });
    }
    return { published: change.publishes };
  },
});

/** Change log for one duty: admin/mod, BGH, and the creator only. Newest first. */
export const changeHistory = query({
  args: { dutyId: v.id("duties") },
  handler: async (ctx, args) => {
    const { user, isAdmin } = await requireDutiesAccess(ctx);
    const duty = await ctx.db.get(args.dutyId);
    if (!duty) throw new Error("DUTY_NOT_FOUND");
    const isReviewer = isAdmin ? false : isDutyWeekReviewer(user, await dutyViewerLevel(ctx, user));
    if (
      !canViewDutyChangeHistory({
        isOps: isAdmin,
        isReviewer,
        isCreator: String(duty.createdBy || "") === String(user._id),
      })
    ) {
      throw new Error("FORBIDDEN");
    }
    const rows = await ctx.db
      .query("dutyChangeLogs")
      .withIndex("by_duty_at", (q) => q.eq("dutyId", args.dutyId))
      .order("desc")
      .take(200);
    const actors = await loadDocsByIds(ctx, rows.map((row) => row.actorUserId));
    const actorNames = new Map(actors.map((row: any) => [String(row._id), String(row.name || row.email || "")]));
    return rows.map((row) => ({
      _id: row._id,
      at: row.at,
      atLabel: formatDutyLogTimestamp(row.at),
      action: row.action,
      actionLabel: DUTY_CHANGE_ACTION_LABELS[row.action],
      actorName: actorNames.get(String(row.actorUserId)) || "Người dùng đã xóa",
      actorKind: row.actorKind,
      actorRoleLabel: DUTY_ACTOR_KIND_LABELS[row.actorKind],
      changes: row.changes,
    }));
  },
});

export const setAttendance = mutation({
  args: {
    dutyId: v.id("duties"),
    status: v.union(v.literal("attended"), v.literal("absent")),
  },
  handler: async (ctx, args) => {
    const attendanceConfirmationEnabled = await getBooleanSystemSetting(
      ctx,
      DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
      DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
    );
    if (!attendanceConfirmationEnabled) throw new Error("ATTENDANCE_CONFIRMATION_DISABLED");
    const { user, access } = await requireDutiesAccess(ctx);
    if (!canOperateMenu(access)) throw new Error("FORBIDDEN: duties menu hidden");

    // Attendance only exists for the approved copy.
    const duty = projectPublicDuty(await ctx.db.get(args.dutyId));
    if (!duty) throw new Error("DUTY_NOT_FOUND");
    if (!userIsParticipant(user, duty)) throw new Error("NOT_A_PARTICIPANT");

    const timing = dutyTiming(duty);
    if (!timing.isOngoing) throw new Error("ATTENDANCE_OUTSIDE_WINDOW");

    const existing = await ctx.db
      .query("dutyAttendances")
      .withIndex("by_duty_user", (q) => q.eq("dutyId", args.dutyId).eq("userId", user._id))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        updatedAt: now,
        updatedBy: user._id,
      });
    } else {
      await ctx.db.insert("dutyAttendances", {
        dutyId: args.dutyId,
        userId: user._id,
        status: args.status,
        updatedAt: now,
        updatedBy: user._id,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      action: "duty.attendance",
      targetUserId: user._id,
      details: JSON.stringify({ dutyId: args.dutyId, status: args.status }),
      at: now,
    });
  },
});

export const setAttendanceForUser = mutation({
  args: {
    dutyId: v.id("duties"),
    userId: v.id("users"),
    status: v.union(v.literal("attended"), v.literal("absent")),
  },
  handler: async (ctx, args) => {
    const attendanceConfirmationEnabled = await getBooleanSystemSetting(
      ctx,
      DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
      DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
    );
    if (!attendanceConfirmationEnabled) throw new Error("ATTENDANCE_CONFIRMATION_DISABLED");
    const { user, access, isAdmin } = await requireDutiesAccess(ctx);
    if (!isAdmin && !canOperateMenu(access)) throw new Error("FORBIDDEN: duties menu hidden");

    // Attendance only exists for the approved copy.
    const duty = projectPublicDuty(await ctx.db.get(args.dutyId));
    if (!duty) throw new Error("DUTY_NOT_FOUND");
    const target = await ctx.db.get(args.userId);
    if (!target || target.status !== "active") throw new Error("USER_NOT_FOUND");
    const positions = await ctx.db.query("positions").collect();
    if (!isAdmin && !isSameDepartmentSubordinate(user, target, positions)) {
      throw new Error("NOT_A_SUBORDINATE");
    }
    if (!userIsParticipant(target, duty)) throw new Error("NOT_A_PARTICIPANT");

    const timing = dutyTiming(duty);
    if (!timing.isOngoing) throw new Error("ATTENDANCE_OUTSIDE_WINDOW");

    const existing = await ctx.db
      .query("dutyAttendances")
      .withIndex("by_duty_user", (q) => q.eq("dutyId", args.dutyId).eq("userId", args.userId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        updatedAt: now,
        updatedBy: user._id,
      });
    } else {
      await ctx.db.insert("dutyAttendances", {
        dutyId: args.dutyId,
        userId: args.userId,
        status: args.status,
        updatedAt: now,
        updatedBy: user._id,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorUserId: user._id,
      action: "duty.attendance_for_subordinate",
      targetUserId: target._id,
      targetEmail: target.email,
      details: JSON.stringify({ dutyId: args.dutyId, status: args.status }),
      at: now,
    });
  },
});
