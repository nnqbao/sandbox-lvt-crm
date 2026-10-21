import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  activePositionLevel,
  canOperateMenu,
  currentUserOrThrow,
  DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
  DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
  getBooleanSystemSetting,
  getWorkAssignerMode,
  isOperationalManagerRole,
  isSameDepartmentSubordinate,
  resolveUserMenuAccess,
  WORK_ASSIGNER_MODE_ADMIN_MOD,
} from "./lib";
import { canCreateAssignments, dutyListTitle, dutyLocationLabel } from "./assignmentPolicy";
import { dutyTiming, requireDutiesAccess } from "./duties";
import { canReviewerEditDuty, dutyHasPendingChange, isDutyWeekReviewer, projectPublicDuty } from "./dutyApproval";
import {
  dutyListDateWindow,
  dutyScheduleRevision,
  loadActiveDutiesOverlapping,
  loadPublicDutiesOverlapping,
  loadDocsByIds,
  parseDutyDateRange,
} from "./dutyRange";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function mapNames(ids: string[], rows: { _id: string; name: string }[]) {
  const names = new Map(rows.map((row) => [String(row._id), row.name]));
  return ids
    .map((id) => names.get(String(id)))
    .filter((name): name is string => Boolean(name));
}

function userIsParticipant(
  user: { _id: string; departmentId?: string },
  duty: { departmentIds: string[]; participantUserIds: string[] },
) {
  if (duty.participantUserIds.some((id) => String(id) === String(user._id))) {
    return true;
  }
  return Boolean(
    user.departmentId &&
      duty.departmentIds.some((id) => String(id) === String(user.departmentId)),
  );
}

function todayInVietnam() {
  const date = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function workItemStatus(tasks: any[], today = todayInVietnam()) {
  if (!tasks.length) return "unassigned";
  const completed = tasks.every((task) =>
    task.assigneeUserIds.every((userId: string) =>
      task.completedUserIds.some(
        (completedUserId: string) => String(completedUserId) === String(userId),
      ),
    ),
  );
  if (completed) {
    const anyLate = tasks.some((task) =>
      task.assigneeUserIds.some((userId: string) =>
        (task.completedLateUserIds || []).some(
          (lateId: string) => String(lateId) === String(userId),
        ),
      ),
    );
    return anyLate ? "completed_late" : "completed";
  }
  if (tasks.some((task) => task.deadline < today)) return "overdue";
  return "pending";
}

function assignmentTypeOf(item: any): "department" | "individual" {
  return item?.assignmentType === "individual" ? "individual" : "department";
}

function individualAssigneeIdsForDocument(workItems: any[], documentId: string) {
  const ids = new Set<string>();
  for (const item of workItems) {
    if (String(item.documentId) !== String(documentId)) continue;
    if (assignmentTypeOf(item) !== "individual") continue;
    for (const userId of item.assigneeUserIds || []) ids.add(String(userId));
  }
  return ids;
}

function departmentRosterMembers(
  item: any,
  document: any,
  activeUsers: any[],
  excludedIndividualIds: Set<string>,
) {
  return activeUsers.filter((user: any) => {
    if (String(user.departmentId || "") !== String(item.departmentId || "")) return false;
    if (isOperationalManagerRole(user.role)) return false;
    if ((document.approverUserIds || []).some((id: string) => String(id) === String(user._id))) {
      return false;
    }
    if (excludedIndividualIds.has(String(user._id))) return false;
    return true;
  });
}

function emptyKpi() {
  return { total: 0, onTime: 0, late: 0, incomplete: 0 };
}

function bumpKpi(
  kpi: { total: number; onTime: number; late: number; incomplete: number },
  status: string,
) {
  kpi.total += 1;
  if (status === "completed") kpi.onTime += 1;
  else if (status === "completed_late") kpi.late += 1;
  else kpi.incomplete += 1;
}

async function loadActiveUsers(ctx: { db: any }) {
  return ctx.db
    .query("users")
    .withIndex("by_status", (q: any) => q.eq("status", "active"))
    .collect();
}

async function loadActiveDepartmentUsers(ctx: { db: any }, departmentId?: string) {
  if (!departmentId) return [];
  const rows = await ctx.db
    .query("users")
    .withIndex("by_department", (q: any) => q.eq("departmentId", String(departmentId)))
    .collect();
  return rows.filter((user: { status?: string }) => user.status === "active");
}

async function loadAttendancesForDuties(ctx: { db: any }, dutyIds: string[]) {
  if (!dutyIds.length) return [];
  const groups = await Promise.all(
    dutyIds.map((dutyId) =>
      ctx.db
        .query("dutyAttendances")
        .withIndex("by_duty", (q: any) => q.eq("dutyId", dutyId))
        .collect(),
    ),
  );
  return groups.flat();
}

function dutyCalendarRevisionMeta(input: {
  attendanceConfirmationEnabled: boolean;
  access: string;
  isAdmin: boolean;
  actor: {
    _id: string;
    role?: string;
    departmentId?: string;
    positionId?: string;
    permissionGroupId?: string;
    updatedAt?: number;
  };
  selected: { _id: string; departmentId?: string; positionId?: string; updatedAt?: number };
}) {
  return [
    input.attendanceConfirmationEnabled ? "confirm" : "noconfirm",
    input.access,
    input.isAdmin ? "ops" : "member",
    String(input.actor._id),
    String(input.actor.role || ""),
    String(input.actor.departmentId || ""),
    String(input.actor.positionId || ""),
    String(input.actor.permissionGroupId || ""),
    String(Number(input.actor.updatedAt) || 0),
    String(input.selected._id),
    String(input.selected.departmentId || ""),
    String(input.selected.positionId || ""),
    String(Number(input.selected.updatedAt) || 0),
  ].join("|");
}

function buildDutyCalendarRevision(input: {
  duties: Array<{ _id: string; updatedAt?: number }>;
  attendances: Array<{ dutyId: string; userId: string; status?: string; updatedAt?: number }>;
  attendanceConfirmationEnabled: boolean;
  access: string;
  isAdmin: boolean;
  actor: {
    _id: string;
    role?: string;
    departmentId?: string;
    positionId?: string;
    permissionGroupId?: string;
    updatedAt?: number;
  };
  selected: { _id: string; departmentId?: string; positionId?: string; updatedAt?: number };
}) {
  return dutyScheduleRevision({
    duties: input.duties,
    attendances: input.attendances,
    meta: dutyCalendarRevisionMeta(input),
  });
}

/**
 * Văn thư (admin/mod) see working rows, flagged when BGH has not approved them.
 * Everyone else only sees approved copies.
 */
async function loadCalendarDuties(ctx: { db: any }, isAdmin: boolean, startDate: string, endDate: string) {
  if (isAdmin) return loadActiveDutiesOverlapping(ctx, startDate, endDate);
  return loadPublicDutiesOverlapping(ctx, startDate, endDate);
}

async function resolveVisibleDutyUser(
  ctx: { db: any },
  actor: { _id: string; departmentId?: string; positionId?: string },
  access: string,
  isAdmin: boolean,
  userId?: string,
): Promise<any> {
  if (!userId || String(userId) === String(actor._id)) return actor;
  const selected = await ctx.db.get(userId);
  if (!selected || selected.status !== "active") throw new Error("REPORT_USER_FORBIDDEN");
  if (isAdmin || access === "view_all") return selected;
  const positions = await loadDocsByIds(ctx, [actor.positionId, selected.positionId]);
  if (!isSameDepartmentSubordinate(actor, selected, positions)) {
    throw new Error("REPORT_USER_FORBIDDEN");
  }
  return selected;
}

export const dutyCalendar = query({
  args: {
    userId: v.optional(v.id("users")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rawStart = args.startDate?.trim() || "";
    const rawEnd = args.endDate?.trim() || "";
    const window = !rawStart && !rawEnd ? dutyListDateWindow() : { startDate: rawStart, endDate: rawEnd };
    if (!DATE_RE.test(window.startDate) || !DATE_RE.test(window.endDate) || window.endDate < window.startDate) {
      throw new Error("INVALID_DATE_RANGE");
    }
    const { startDate, endDate } = window;

    const { user: actor, access, isAdmin } = await requireDutiesAccess(ctx);
    const canViewAll = isAdmin || access === "view_all";
    const canEdit = isAdmin || canOperateMenu(access);

    const [seedUsers, dutiesInWindow, attendanceConfirmationEnabled] = await Promise.all([
      canViewAll ? loadActiveUsers(ctx) : loadActiveDepartmentUsers(ctx, actor.departmentId),
      loadCalendarDuties(ctx, isAdmin, startDate, endDate),
      getBooleanSystemSetting(
        ctx,
        DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
        DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
      ),
    ]);
    const roster = new Map<string, any>(
      seedUsers.map((user: any) => [String(user._id), user]),
    );
    if (!roster.has(String(actor._id))) roster.set(String(actor._id), actor);

    let positions = await loadDocsByIds(ctx, [
      actor.positionId,
      ...seedUsers.map((user: { positionId?: string }) => user.positionId),
    ]);
    const actorLevel = activePositionLevel(actor, positions);
    const canCreate = canCreateAssignments(actor.role, actorLevel);
    const isReviewer = !isAdmin && isDutyWeekReviewer(actor, actorLevel);
    const canManageSubordinates =
      attendanceConfirmationEnabled && !isAdmin && canEdit && actorLevel > 0;
    const visibleUsers = canViewAll
      ? [...roster.values()]
      : [...roster.values()].filter(
          (user) =>
            String(user._id) === String(actor._id) ||
            isSameDepartmentSubordinate(actor, user, positions),
        );
    const selectedUserId = String(args.userId || actor._id);
    const selectedUser = visibleUsers.find(
      (user) => String(user._id) === selectedUserId,
    );
    if (!selectedUser) throw new Error("REPORT_USER_FORBIDDEN");

    const duties = dutiesInWindow.filter((duty: { departmentIds: string[]; participantUserIds: string[] }) =>
      userIsParticipant(selectedUser, duty),
    );
    if (!canViewAll && duties.length) {
      const known = new Set(roster.keys());
      const extraDepartmentIds = [
        ...new Set(
          duties.flatMap((duty: { departmentIds?: string[] }) => duty.departmentIds || []).map(String),
        ),
      ];
      const extraUserIds = duties
        .flatMap((duty: { participantUserIds?: string[] }) => duty.participantUserIds || [])
        .map(String)
        .filter((id: string) => !known.has(id));
      const [departmentGroups, extraUsers] = await Promise.all([
        Promise.all(extraDepartmentIds.map((departmentId) => loadActiveDepartmentUsers(ctx, departmentId))),
        loadDocsByIds(ctx, extraUserIds),
      ]);
      for (const user of departmentGroups.flat()) roster.set(String(user._id), user);
      for (const user of extraUsers) {
        if (user.status === "active") roster.set(String(user._id), user);
      }
      const loadedPositionIds = new Set(positions.map((position) => String(position._id)));
      const missingPositionIds = [...roster.values()]
        .map((user) => user.positionId)
        .filter((id) => id && !loadedPositionIds.has(String(id)));
      if (missingPositionIds.length) {
        positions = positions.concat(await loadDocsByIds(ctx, missingPositionIds));
      }
    }
    const users = [...roster.values()];

    const [departments, locations, attendances] = await Promise.all([
      loadDocsByIds(ctx, [
        ...users.map((user) => user.departmentId),
        ...visibleUsers.map((user) => user.departmentId),
        ...duties.flatMap((duty: { departmentIds?: string[] }) => duty.departmentIds || []),
      ]),
      loadDocsByIds(ctx, duties.flatMap((duty: { locationIds?: string[] }) => duty.locationIds || [])),
      loadAttendancesForDuties(ctx, duties.map((duty: { _id: string }) => String(duty._id))),
    ]);
    const attendanceMap = new Map(
      attendances.map((attendance: { dutyId: string; userId: string; status: string }) => [
        `${String(attendance.dutyId)}:${String(attendance.userId)}`,
        attendance.status,
      ]),
    );
    const selectedAttendance = (dutyId: string, userId: string) =>
      (attendanceMap.get(`${dutyId}:${userId}`) as string) ||
      (attendanceConfirmationEnabled ? "pending" : "attended");
    const subordinateIds = new Set(
      users
        .filter(
          (user) =>
            user.status === "active" && isSameDepartmentSubordinate(actor, user, positions),
        )
        .map((user) => String(user._id)),
    );
    const isSelectedSelf = String(selectedUser._id) === String(actor._id);
    const canMarkSelectedUser =
      attendanceConfirmationEnabled &&
      ((isSelectedSelf && canEdit) ||
        (canManageSubordinates &&
          isSameDepartmentSubordinate(actor, selectedUser, positions)));
    const departmentMap = new Map(
      departments.map((department) => [String(department._id), department]),
    );
    const positionMap = new Map(
      positions.map((position) => [String(position._id), position]),
    );

    const people = visibleUsers
      .map((user) => {
        const department = user.departmentId
          ? departmentMap.get(String(user.departmentId))
          : undefined;
        const position = user.positionId
          ? positionMap.get(String(user.positionId))
          : undefined;
        return {
          _id: user._id,
          name: user.name || user.email || "Chưa đặt tên",
          email: user.email || "",
          isSelf: String(user._id) === String(actor._id),
          departmentName: department?.name || "",
          positionName: position?.name || "",
          positionLevel: activePositionLevel(user, positions),
        };
      })
      .sort(
        (a, b) =>
          Number(b.isSelf) - Number(a.isSelf) ||
          b.positionLevel - a.positionLevel ||
          a.name.localeCompare(b.name, "vi"),
      );

    const now = Date.now();
    const events = duties
      .map((duty) => {
        const timing = dutyTiming(duty, now);
        const participants = users.filter(
          (user) => user.status === "active" && userIsParticipant(user, duty),
        );
        const subordinateParticipants = isSelectedSelf
          ? participants
              .filter((participant) => subordinateIds.has(String(participant._id)))
              .map((participant) => ({
                _id: participant._id,
                name: participant.name || participant.email || "Chưa đặt tên",
                status: selectedAttendance(String(duty._id), String(participant._id)),
              }))
          : [];
        const visibleParticipants = canViewAll
          ? participants.map((participant) => ({
              _id: participant._id,
              name: participant.name || participant.email || "Chưa đặt tên",
              departmentName:
                (participant.departmentId
                  ? departmentMap.get(String(participant.departmentId))?.name
                  : "") || "Chưa gán phòng ban",
              status: selectedAttendance(String(duty._id), String(participant._id)),
            }))
          : [];
        return {
          _id: duty._id,
          title: dutyListTitle(duty),
          content: duty.content,
          startDate: duty.startDate,
          endDate: duty.endDate,
          startTime: duty.startTime,
          endTime: duty.endTime,
          allDay: duty.allDay,
          locationNames: [dutyLocationLabel(duty, mapNames(duty.locationIds, locations))].filter(Boolean),
          locationText: duty.locationText || "",
          departmentIds: duty.departmentIds || [],
          participantUserIds: duty.participantUserIds || [],
          departmentNames: mapNames(duty.departmentIds, departments),
          participantNames: participants.map(
            (participant) => participant.name || participant.email || "",
          ).filter(Boolean),
          otherParticipants: String(duty.otherParticipants || "").trim(),
          createdAt: duty.createdAt,
          updatedAt: duty.updatedAt,
          assignmentType: duty.participantUserIds.some(
            (id) => String(id) === selectedUserId,
          )
            ? "individual"
            : "department",
          attendanceStatus: selectedAttendance(String(duty._id), String(selectedUser._id)),
          awaitingApproval: isAdmin && dutyHasPendingChange(duty),
          canManage: isAdmin || String(duty.createdBy || "") === String(actor._id),
          // BGH corrects school rows directly (reviewerUpdate re-checks on the server).
          canReviewerEdit: isReviewer && canReviewerEditDuty(actor, actorLevel, duty),
          canViewHistory: isAdmin || isReviewer || String(duty.createdBy || "") === String(actor._id),
          canMarkSelectedUser,
          canMarkAttendance: canMarkSelectedUser && timing.isOngoing && Boolean(projectPublicDuty(duty)),
          timing: {
            isOngoing: timing.isOngoing,
            isUpcoming: timing.isUpcoming,
            isOverdue: timing.isOverdue,
            nearDeadline: timing.nearDeadline,
          },
          subordinateParticipants,
          visibleParticipants,
        };
      })
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          a.startTime.localeCompare(b.startTime),
      );

    return {
      people,
      visibilityScope: canViewAll ? "all" : "team",
      selectedUserId: selectedUser._id,
      selectedUserName:
        selectedUser.name || selectedUser.email || "Chưa đặt tên",
      actorUserId: actor._id,
      isSelectedSelf,
      canCreate,
      canEdit,
      canManageSubordinates,
      attendanceConfirmationEnabled,
      startDate,
      endDate,
      revision: buildDutyCalendarRevision({
        duties,
        attendances,
        attendanceConfirmationEnabled,
        access,
        isAdmin,
        actor,
        selected: selectedUser,
      }),
      events,
    };
  },
});

/**
 * Cheap stamp for one person's Lịch công tác window.
 * Same duty slice and attendance rows as `dutyCalendar`, without the roster,
 * department, or location joins.
 */
export const dutyCalendarRevision = query({
  args: {
    userId: v.optional(v.id("users")),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const { startDate, endDate } = parseDutyDateRange(args.startDate, args.endDate);
    const { user: actor, access, isAdmin } = await requireDutiesAccess(ctx);
    const selectedUser = await resolveVisibleDutyUser(ctx, actor, access, isAdmin, args.userId);
    const [dutiesInWindow, attendanceConfirmationEnabled] = await Promise.all([
      loadCalendarDuties(ctx, isAdmin, startDate, endDate),
      getBooleanSystemSetting(
        ctx,
        DUTY_ATTENDANCE_CONFIRMATION_SETTING_KEY,
        DUTY_ATTENDANCE_CONFIRMATION_DEFAULT,
      ),
    ]);
    const duties = dutiesInWindow.filter((duty: { departmentIds: string[]; participantUserIds: string[] }) =>
      userIsParticipant(selectedUser, duty),
    );
    const attendances = await loadAttendancesForDuties(
      ctx,
      duties.map((duty: { _id: string }) => String(duty._id)),
    );
    return {
      startDate,
      endDate,
      revision: buildDutyCalendarRevision({
        duties,
        attendances,
        attendanceConfirmationEnabled,
        access,
        isAdmin,
        actor,
        selected: selectedUser,
      }),
    };
  },
});

/** Calendar data for the Work report. Visibility follows the user's report permission and rank. */
export const workCalendar = query({
  args: {
    userId: v.optional(v.id("users")),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const startDate = args.startDate.trim();
    const endDate = args.endDate.trim();
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate) || endDate < startDate) {
      throw new Error("INVALID_DATE_RANGE");
    }

    const actor = await currentUserOrThrow(ctx);
    if (actor.status !== "active") throw new Error("USER_NOT_ACTIVE");
    if (actor.mustChangePassword) throw new Error("PASSWORD_CHANGE_REQUIRED");
    const menuAccess = await resolveUserMenuAccess(ctx, actor);
    if (!isOperationalManagerRole(actor.role) && menuAccess.reports === "hidden") {
      throw new Error("FORBIDDEN: reports menu hidden");
    }

    const assignerMode = await getWorkAssignerMode(ctx);
    const [users, documents, workItems, personalTasks, departments, positions] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("officeDocuments").collect(),
      ctx.db.query("workItems").collect(),
      ctx.db.query("personalTasks").collect(),
      ctx.db.query("departments").collect(),
      ctx.db.query("positions").collect(),
    ]);
    const activeUsers = users.filter((user) => user.status === "active");
    const activeDocuments = documents.filter((document) => document.active);
    const activeWorkItems = workItems.filter((item) => item.active);
    const activeTasks = personalTasks.filter((task) => task.active);
    const documentsById = new Map(activeDocuments.map((document) => [String(document._id), document]));
    const departmentsById = new Map(departments.map((department) => [String(department._id), department]));
    const tasksByWorkItem = new Map<string, typeof activeTasks>();
    for (const task of activeTasks) {
      const tasks = tasksByWorkItem.get(String(task.workItemId)) || [];
      tasks.push(task);
      tasksByWorkItem.set(String(task.workItemId), tasks);
    }

    const canViewAll =
      isOperationalManagerRole(actor.role) || menuAccess.reports === "view_all";
    const actorLevel = isOperationalManagerRole(actor.role)
      ? 5 : activePositionLevel(actor, positions);
    const visibleUsers = canViewAll
      ? activeUsers
      : activeUsers.filter(
          (user) =>
            String(user._id) === String(actor._id) ||
            isSameDepartmentSubordinate(actor, user, positions),
        );
    const selectedUserId = String(args.userId || actor._id);
    const selectedUser = visibleUsers.find((user) => String(user._id) === selectedUserId);
    if (!selectedUser) throw new Error("REPORT_USER_FORBIDDEN");
    const selectedMenuAccess = await resolveUserMenuAccess(ctx, selectedUser);
    const selectedCanViewAll =
      isOperationalManagerRole(selectedUser.role) || selectedMenuAccess.reports === "view_all";
    const selectedLevel = isOperationalManagerRole(selectedUser.role)
      ? 5 : activePositionLevel(selectedUser, positions);
    const inRange = (deadline: string) => deadline >= startDate && deadline <= endDate;
    const today = todayInVietnam();
    const events: Array<{
      _id: string;
      content: string;
      startDate: string;
      endDate: string;
      deadline: string;
      status: string;
      qualityPercent?: number | null;
      kind: string;
      kindLabel: string;
      departmentName: string;
      documentName: string;
    }> = [];
    const kpi = emptyKpi();

    if (selectedCanViewAll) {
      for (const document of activeDocuments) {
        if (!inRange(document.deadline) || !["approved", "pending"].includes(document.status)) continue;
        events.push({
          _id: String(document._id),
          content: document.fileName || document.content || "Công văn chưa đặt tên",
          startDate: document.deadline,
          endDate: document.deadline,
          deadline: document.deadline,
          status: document.status,
          kind: "document",
          kindLabel: "Công văn",
          departmentName: "Toàn trường",
          documentName: document.fileName || "Công văn",
        });
      }
    }

    if (assignerMode === WORK_ASSIGNER_MODE_ADMIN_MOD) {
      for (const item of activeWorkItems) {
        const document = documentsById.get(String(item.documentId));
        if (!document || document.status !== "approved" || !inRange(item.deadline)) continue;
        const siblings = activeWorkItems.filter(
          (row) => String(row.documentId) === String(item.documentId),
        );
        const excluded = individualAssigneeIdsForDocument(siblings, item.documentId);
        const type = assignmentTypeOf(item);
        let isAssignee = false;
        if (type === "individual") {
          isAssignee = (item.assigneeUserIds || []).some(
            (id: string) => String(id) === String(selectedUser._id),
          );
        } else {
          const members = departmentRosterMembers(item, document, activeUsers, excluded);
          isAssignee = members.some((member: any) => String(member._id) === String(selectedUser._id));
        }
        if (!isAssignee) continue;
        const completed = (item.completedUserIds || []).some(
          (id: string) => String(id) === String(selectedUser._id),
        );
        const late = (item.completedLateUserIds || []).some(
          (id: string) => String(id) === String(selectedUser._id),
        );
        const status = completed
          ? (late ? "completed_late" : "completed")
          : item.deadline < today
            ? "overdue"
            : "pending";
        const qualityPercent = (item.completions || []).find(
          (row: any) => String(row.userId) === String(selectedUser._id) && row.status === "approved",
        )?.qualityPercent;
        bumpKpi(kpi, status);
        events.push({
          _id: String(item._id),
          content: item.content,
          startDate: item.deadline,
          endDate: item.deadline,
          deadline: item.deadline,
          status,
          qualityPercent: qualityPercent ?? null,
          kind: type === "individual" ? "personal_task" : "department_work",
          kindLabel: type === "individual" ? "Công việc cá nhân" : "Việc phòng ban",
          departmentName:
            type === "individual"
              ? "Cá nhân"
              : departmentsById.get(String(item.departmentId))?.name || "Chưa gán phòng ban",
          documentName: document.fileName || "Công văn",
        });
      }
    } else if (!selectedCanViewAll) {
      if (selectedLevel === 2 || selectedLevel === 3) {
        for (const item of activeWorkItems) {
          const document = documentsById.get(String(item.documentId));
          if (
            document?.status !== "approved" ||
            assignmentTypeOf(item) !== "department" ||
            String(item.departmentId) !== String(selectedUser.departmentId || "") ||
            !inRange(item.deadline)
          ) continue;
          const status = workItemStatus(tasksByWorkItem.get(String(item._id)) || []);
          bumpKpi(kpi, status === "unassigned" ? "pending" : status);
          events.push({
            _id: String(item._id),
            content: item.content,
            startDate: item.deadline,
            endDate: item.deadline,
            deadline: item.deadline,
            status,
            kind: "department_work",
            kindLabel: "Việc phòng ban",
            departmentName:
              departmentsById.get(String(item.departmentId))?.name || "Chưa gán phòng ban",
            documentName: document.fileName || "Công văn",
          });
        }
      } else {
        for (const task of activeTasks) {
          const item = activeWorkItems.find((workItem) => String(workItem._id) === String(task.workItemId));
          const document = item ? documentsById.get(String(item.documentId)) : undefined;
          if (
            !item ||
            document?.status !== "approved" ||
            !task.assigneeUserIds.some((userId) => String(userId) === String(selectedUser._id)) ||
            !inRange(task.deadline)
          ) continue;
          const completed = task.completedUserIds.some(
            (userId) => String(userId) === String(selectedUser._id),
          );
          const late = (task.completedLateUserIds || []).some(
            (userId) => String(userId) === String(selectedUser._id),
          );
          const status = completed
            ? (late ? "completed_late" : "completed")
            : task.deadline < today
              ? "overdue"
              : "pending";
          const qualityPercent = (task.completions || []).find(
            (row: any) => String(row.userId) === String(selectedUser._id) && row.status === "approved",
          )?.qualityPercent;
          bumpKpi(kpi, status);
          events.push({
            _id: String(task._id),
            content: task.title,
            startDate: task.deadline,
            endDate: task.deadline,
            deadline: task.deadline,
            status,
            qualityPercent: qualityPercent ?? null,
            kind: "personal_task",
            kindLabel: "Công việc cá nhân",
            departmentName:
              departmentsById.get(String(item.departmentId))?.name || "Chưa gán phòng ban",
            documentName: document.fileName || "Công văn",
          });
        }
      }
    }

    events.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.content.localeCompare(b.content, "vi"));
    return {
      assignerMode,
      kpi,
      people: visibleUsers
        .map((user) => {
          const department = user.departmentId ? departmentsById.get(String(user.departmentId)) : undefined;
          const position = user.positionId ? positions.find((item) => String(item._id) === String(user.positionId)) : undefined;
          return {
            _id: user._id,
            name: user.name || user.email || "Chưa đặt tên",
            email: user.email || "",
            isSelf: String(user._id) === String(actor._id),
            departmentName: department?.name || "",
            positionName: position?.name || "",
            positionLevel: activePositionLevel(user, positions),
          };
        })
        .sort(
          (a, b) => Number(b.isSelf) - Number(a.isSelf) || b.positionLevel - a.positionLevel || a.name.localeCompare(b.name, "vi"),
        ),
      selectedUserId: selectedUser._id,
      selectedUserName: selectedUser.name || selectedUser.email || "Chưa đặt tên",
      visibilityScope: selectedCanViewAll
        ? "all"
        : actorLevel >= 2
          ? "self_and_subordinates"
          : "personal",
      events,
    };
  },
});
