import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const timestamps = { createdAt: v.number(), updatedAt: v.number() };

const menuAccessLevel = v.union(
  v.literal("hidden"),
  v.literal("view"),
  v.literal("view_all"),
  /** Legacy write level; normalizeMenuAccess maps this to `view`. */
  v.literal("edit"),
  v.literal("supervisor"),
);

export default defineSchema({
  ...authTables,
  // Extend Convex Auth users with CRM profile/authorization fields.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    /** Private Convex Storage object for the signed-in user's profile photo. Never return this id to clients. */
    avatarStorageId: v.optional(v.id("_storage")),
    avatarFileName: v.optional(v.string()),
    avatarContentType: v.optional(v.string()),
    avatarSize: v.optional(v.number()),
    avatarChecksum: v.optional(v.string()),
    avatarUpdatedAt: v.optional(v.number()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Legacy field retained as optional during migration; email is the only login identity.
    username: v.optional(v.string()),
    /** System role: admin | moderator | user. Only regular users use permission groups. */
    role: v.string(),
    departmentId: v.optional(v.string()),
    permissionGroupId: v.optional(v.string()),
    positionId: v.optional(v.string()),
    status: v.string(), // pending | active | disabled
    mustChangePassword: v.boolean(),
    lastPasswordResetAt: v.optional(v.number()),
    /** Set when failed-login lockout triggers; cleared only by admin unlock. */
    loginLockedAt: v.optional(v.number()),
    /** Set when a bulk-import rollback disables this row; cleared on successful re-import. */
    importRollbackAt: v.optional(v.number()),
    failedLoginCount: v.optional(v.number()),
    failedLoginWindowStart: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_status", ["status"])
    .index("by_department", ["departmentId"])
    .index("by_permission_group", ["permissionGroupId"])
    .index("by_position", ["positionId"]),
  /**
   * Client-reported metadata for authSessions (Telegram-style device list).
   * authSessions rows remain owned by Convex Auth; this table only enriches them.
   */
  deviceSessions: defineTable({
    sessionId: v.id("authSessions"),
    userId: v.id("users"),
    deviceName: v.string(),
    platformLabel: v.string(),
    clientKind: v.string(), // web | android | ios | unknown
    appVersion: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    pushToken: v.optional(v.string()),
    lastActiveAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"])
    .index("by_user_push", ["userId", "pushToken"]),
  departments: defineTable({
    name: v.string(),
    code: v.string(),
    active: v.boolean(),
    ...timestamps,
  }).index("by_code", ["code"]),
  /** Physical / organizational locations used by school workflows. */
  locations: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    ...timestamps,
  }).index("by_name", ["name"]),
  /**
   * Permission groups (Nhóm quyền) control which system menus a regular user can see/edit.
   * Administrator and Moderator ignore this and always see all primary features.
   */
  permissionGroups: defineTable({
    name: v.string(),
    /** Admin-defined uppercase code (≤20, A-Z0-9_-). Optional only for legacy rows pending backfill. */
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    /** One entry per system menu: hidden | view | view_all | supervisor; legacy edit accepted and normalized to view */
    menuAccess: v.array(
      v.object({
        menu: v.string(),
        access: menuAccessLevel,
      }),
    ),
    active: v.boolean(),
    ...timestamps,
  })
    .index("by_name", ["name"])
    .index("by_code", ["code"]),
  /**
   * Temporary bulk-user-import Excel uploads retained for 1 hour (even after commit).
   */
  userImportUploads: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    uploadedBy: v.id("users"),
    status: v.string(), // uploaded | committed | expired
    rowCount: v.optional(v.number()),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_expiresAt", ["expiresAt"]),
  /**
   * Temporary duty-import Excel uploads retained for 1 hour (even after commit).
   */
  dutyImportUploads: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    uploadedBy: v.id("users"),
    status: v.string(), // uploaded | committing | committed | expired
    rowCount: v.optional(v.number()),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_expiresAt", ["expiresAt"]),
  /**
   * Job positions (Chức vụ) with approval rank 1–5 (gold stars).
   * Higher rank may approve for lower ranks; full workflow uses this later.
   */
  positions: defineTable({
    name: v.string(),
    code: v.string(),
    level: v.number(), // 1 (lowest) … 5 (highest)
    active: v.boolean(),
    ...timestamps,
  }).index("by_code", ["code"]),
  /** Catalog of work-file kinds (Kế hoạch / Biên bản / Báo cáo, plus admin-added rows). */
  documentTypes: defineTable({
    name: v.string(),
    code: v.string(),
    active: v.boolean(),
    ...timestamps,
  }).index("by_code", ["code"]),
  /** Boarding-school participation periods, configured once per semester/school year. */
  boardingPeriods: defineTable({
    semester: v.number(), // 1 | 2
    schoolYear: v.string(), // YYYY-YYYY
    participantUserIds: v.array(v.string()),
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  }).index("by_school_year_semester", ["schoolYear", "semester"]),
  /**
   * Legacy roles table kept optional for migration of older deployments.
   * New auth uses users.role (admin|moderator|user) + permissionGroups.
   */
  roles: defineTable({
    name: v.string(),
    key: v.string(),
    permissions: v.array(v.string()),
    active: v.boolean(),
    ...timestamps,
  }).index("by_key", ["key"]),
  auditLogs: defineTable({
    actorUserId: v.string(),
    action: v.string(),
    targetUserId: v.optional(v.string()),
    targetEmail: v.optional(v.string()),
    details: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_target", ["targetUserId"]),
  /**
   * Approval action log for future workflows.
   * Higher-rank approvers may act on behalf of lower ranks; every action is recorded.
   */
  approvalLogs: defineTable({
    actorUserId: v.string(),
    actorPositionId: v.optional(v.string()),
    actorLevel: v.number(),
    targetUserId: v.optional(v.string()),
    targetLevel: v.optional(v.number()),
    taskId: v.optional(v.string()),
    action: v.string(), // approve | approve_on_behalf | reject
    onBehalfOfUserId: v.optional(v.string()),
    onBehalfOfLevel: v.optional(v.number()),
    details: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_task", ["taskId"])
    .index("by_actor", ["actorUserId"]),
  /**
   * School duties / work events (Công tác).
   * Recipients = users in selected departments ∪ explicit participantUserIds.
   * otherParticipants is display-only free text (not a notification recipient).
   */
  duties: defineTable({
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(),
    startTime: v.string(), // HH:mm
    endTime: v.string(),
    allDay: v.boolean(),
    /** Display title; list views prefer this over content. Older rows may omit it. */
    title: v.optional(v.string()),
    content: v.string(),
    locationIds: v.array(v.string()),
    /** Free-text location; new duties write this instead of locationIds. */
    locationText: v.optional(v.string()),
    departmentIds: v.array(v.string()),
    participantUserIds: v.array(v.string()),
    /** Free-text guests; empty/omitted on older rows. Not a push/email recipient. */
    otherParticipants: v.optional(v.string()),
    active: v.boolean(),
    /**
     * "school" = văn thư (admin/mod) row on the shared sheet, goes through weekly
     * BGH approval. "team" = team-lead row for their members, live at once and
     * never on the shared sheet. Missing on rows written before approval existed.
     */
    scope: v.optional(v.union(v.literal("school"), v.literal("team"))),
    /** Set once a school row follows approval; rows without it count as approved. */
    approvalTracked: v.optional(v.boolean()),
    /** Approved copy teachers see while the working fields wait for BGH. */
    published: v.optional(
      v.object({
        startDate: v.string(),
        endDate: v.string(),
        startTime: v.string(),
        endTime: v.string(),
        allDay: v.boolean(),
        title: v.optional(v.string()),
        content: v.string(),
        locationIds: v.array(v.string()),
        locationText: v.optional(v.string()),
        departmentIds: v.array(v.string()),
        participantUserIds: v.array(v.string()),
        otherParticipants: v.optional(v.string()),
        updatedAt: v.number(),
        publishedAt: v.number(),
      }),
    ),
    publishedStartDate: v.optional(v.string()),
    publishedEndDate: v.optional(v.string()),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_active_end", ["active", "endDate"])
    .index("by_start", ["startDate"])
    .index("by_published_start", ["publishedStartDate"])
    .index("by_published_end", ["publishedEndDate"]),
  /**
   * Field-level history of every duty write (create/update/remove/import and
   * BGH direct edits). Values are display strings (names resolved, dd/MM/yyyy).
   * Readable by admin/mod, BGH, and the duty creator (`duties.changeHistory`).
   */
  dutyChangeLogs: defineTable({
    dutyId: v.id("duties"),
    actorUserId: v.string(),
    actorKind: v.union(v.literal("manager"), v.literal("reviewer"), v.literal("team_lead")),
    action: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("reviewer_edit"),
      v.literal("remove"),
      v.literal("import"),
    ),
    at: v.number(),
    changes: v.array(v.object({ field: v.string(), before: v.string(), after: v.string() })),
  }).index("by_duty_at", ["dutyId", "at"]),
  /** Weekly BGH approval state for the shared Lịch công tác (Monday `weekStart`). */
  dutyWeeks: defineTable({
    weekStart: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("submitted"),
      v.literal("returned"),
      v.literal("approved"),
    ),
    submittedBy: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
    returnedBy: v.optional(v.string()),
    returnedAt: v.optional(v.number()),
    returnNote: v.optional(v.string()),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_week", ["weekStart"])
    .index("by_status", ["status"]),
  dutyAttendances: defineTable({
    dutyId: v.string(),
    userId: v.string(),
    /** attended | absent | pending (no record treated as pending) */
    status: v.string(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_duty", ["dutyId"])
    .index("by_user", ["userId"])
    .index("by_duty_user", ["dutyId", "userId"]),
  /** Admin-configurable display and workflow switches. */
  systemSettings: defineTable({
    key: v.string(),
    value: v.optional(v.boolean()),
    numberValues: v.optional(v.array(v.number())),
    stringValue: v.optional(v.string()),
    updatedBy: v.string(),
    ...timestamps,
  }).index("by_key", ["key"]),
  /** Per-user read receipts for deterministic in-app notification milestones. */
  notificationReads: defineTable({
    userId: v.string(),
    notificationKey: v.string(),
    readAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_key", ["userId", "notificationKey"]),
  /** Per-user hides for notification cards dismissed by users with edit access. */
  notificationDismissals: defineTable({
    userId: v.string(),
    notificationKey: v.string(),
    dismissedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_key", ["userId", "notificationKey"]),
  /**
   * Per-user personal reminders on a duty or work item they own.
   * Independent of admin school-wide notification toggles/milestones.
   */
  personalReminders: defineTable({
    userId: v.string(),
    kind: v.union(v.literal("duty"), v.literal("work")),
    sourceType: v.union(
      v.literal("duty"),
      v.literal("department_work"),
      v.literal("personal_task"),
    ),
    sourceId: v.string(),
    enabled: v.boolean(),
    milestonesHours: v.array(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_kind_source", ["userId", "kind", "sourceId"]),
  /**
   * "Việc của tôi": private to-dos. Owner-only (admin/mod included in "others"),
   * independent of the work menu and work-document approval.
   */
  personalTodos: defineTable({
    userId: v.id("users"),
    title: v.string(),
    note: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    remindAt: v.optional(v.number()),
    /** Set by the reminder job when it fires; drives the in-app bell item. */
    remindedAt: v.optional(v.number()),
    reminderJobId: v.optional(v.id("_scheduled_functions")),
    completedAt: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_active_due", ["userId", "active", "dueAt"])
    .index("by_user_active_completed", ["userId", "active", "completedAt"]),
  /** FCM registration tokens, one row per Android app installation. */
  pushTokens: defineTable({
    userId: v.string(),
    token: v.string(),
    appId: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),
  /**
   * Official documents assigned to a department. A document is visible to
   * its selected approvers first, then to the assigned department after all
   * approvals are complete.
  */
  officeDocuments: defineTable({
    /** Legacy Convex Storage object, retained only until Drive migration finishes. */
    fileId: v.optional(v.id("_storage")),
    driveFileId: v.optional(v.string()),
    driveChecksum: v.optional(v.string()),
    storageProvider: v.optional(v.string()),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    /** Required when the document has an attached file. */
    documentTypeId: v.optional(v.string()),
    /** Display title; list views prefer this over fileName. */
    title: v.optional(v.string()),
    /** Legacy first assignment fields retained for existing rows. */
    departmentId: v.string(),
    content: v.string(),
    deadline: v.string(), // YYYY-MM-DD
    assignments: v.optional(
      v.array(
        v.object({
          /** department (default) | individual */
          type: v.optional(v.string()),
          departmentId: v.optional(v.string()),
          userIds: v.optional(v.array(v.string())),
          content: v.string(),
          deadline: v.string(),
        }),
      ),
    ),
    approverUserIds: v.array(v.string()),
    approvedByUserIds: v.array(v.string()),
    rejectedByUserIds: v.optional(v.array(v.string())),
    status: v.string(), // pending | approved | rejected
    /**
     * True when created by admin/moderator: Ban giám hiệu must approve before
     * release. Missing on legacy rows (fallback: creator's current role).
     */
    requiresApproval: v.optional(v.boolean()),
    /** Last time the document was (re)submitted for approval. */
    submittedAt: v.optional(v.number()),
    /** Per-approver decisions of the current submission; reset on edit. */
    approvalDecisions: v.optional(
      v.array(
        v.object({
          userId: v.string(),
          decision: v.string(), // approved | rejected
          at: v.number(),
          reason: v.optional(v.string()),
        }),
      ),
    ),
    /** Last successful edit ("Đã chỉnh sửa bởi …"); not set on create/approve/reject. */
    lastEditedBy: v.optional(v.string()),
    lastEditedAt: v.optional(v.number()),
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_active_deadline", ["active", "deadline"])
    .index("by_department", ["departmentId"])
    .index("by_drive_file", ["driveFileId"]),
  /**
   * Work generated from an official document.
   * assignmentType=department (default): collective task for live department roster.
   * assignmentType=individual: named assignees only.
   * In supervisor mode, personalTasks remain children of department rows.
   */
  workItems: defineTable({
    documentId: v.string(),
    departmentId: v.string(),
    assignmentType: v.optional(v.string()),
    assigneeUserIds: v.optional(v.array(v.string())),
    /** Legacy approved markers; prefer `completions` going forward. */
    completedUserIds: v.optional(v.array(v.string())),
    completedLateUserIds: v.optional(v.array(v.string())),
    /**
     * Per-assignee completion review workflow.
     * status: pending_approval | approved | rejected
     */
    completions: v.optional(
      v.array(
        v.object({
          userId: v.string(),
          status: v.string(),
          submittedAt: v.number(),
          submittedLate: v.boolean(),
          qualityPercent: v.optional(v.number()),
          reviewedAt: v.optional(v.number()),
          reviewedBy: v.optional(v.string()),
          rejectionReason: v.optional(v.string()),
          note: v.optional(v.string()),
          driveFileId: v.optional(v.string()),
          driveChecksum: v.optional(v.string()),
          fileName: v.optional(v.string()),
          fileType: v.optional(v.string()),
          fileSize: v.optional(v.number()),
          documentTypeId: v.optional(v.string()),
        }),
      ),
    ),
    content: v.string(),
    deadline: v.string(), // YYYY-MM-DD
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_document", ["documentId"])
    .index("by_department", ["departmentId"])
    .index("by_active_deadline", ["active", "deadline"]),
  /**
   * Personal work items assigned by a level 2/3 department lead (supervisor mode)
   * to one or more lower-level colleagues in the same department.
   */
  personalTasks: defineTable({
    workItemId: v.string(),
    title: v.string(),
    assigneeUserIds: v.array(v.string()),
    completedUserIds: v.array(v.string()),
    completedLateUserIds: v.optional(v.array(v.string())),
    completions: v.optional(
      v.array(
        v.object({
          userId: v.string(),
          status: v.string(),
          submittedAt: v.number(),
          submittedLate: v.boolean(),
          qualityPercent: v.optional(v.number()),
          reviewedAt: v.optional(v.number()),
          reviewedBy: v.optional(v.string()),
          rejectionReason: v.optional(v.string()),
          note: v.optional(v.string()),
          driveFileId: v.optional(v.string()),
          driveChecksum: v.optional(v.string()),
          fileName: v.optional(v.string()),
          fileType: v.optional(v.string()),
          fileSize: v.optional(v.number()),
          documentTypeId: v.optional(v.string()),
        }),
      ),
    ),
    deadline: v.string(), // YYYY-MM-DD
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_work_item", ["workItemId"])
    .index("by_deadline", ["active", "deadline"]),
  /**
   * Threaded messages on a work document (công việc).
   * Anyone who can already see the document may read and send.
   */
  workMessages: defineTable({
    documentId: v.string(),
    authorUserId: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    active: v.boolean(),
    recalledAt: v.optional(v.number()),
    ...timestamps,
  })
    .index("by_document", ["documentId"])
    .index("by_document_created", ["documentId", "createdAt"])
    .index("by_created", ["createdAt"]),
  /**
   * Threaded messages on a duty (công tác).
   * Anyone who can already see the duty on the personal list may read and send.
   */
  dutyMessages: defineTable({
    dutyId: v.string(),
    authorUserId: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    active: v.boolean(),
    recalledAt: v.optional(v.number()),
    ...timestamps,
  })
    .index("by_duty", ["dutyId"])
    .index("by_duty_created", ["dutyId", "createdAt"])
    .index("by_created", ["createdAt"]),
  /**
   * Per-recipient bell rows for work/duty chat. Written on message create
   * so the header feed does not depend on deadline-source toggles.
   */
  chatNotificationEvents: defineTable({
    userId: v.string(),
    kind: v.union(v.literal("work"), v.literal("duty"), v.literal("group")),
    sourceType: v.union(v.literal("work_chat"), v.literal("duty_chat"), v.literal("group_chat")),
    sourceId: v.string(),
    messageId: v.string(),
    title: v.string(),
    description: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_message", ["messageId"]),
  /**
   * One summary per Trao đổi thread (work document, duty, or user group).
   * The hub list does not scan message tables; it reads per-user inbox rows.
   */
  chatThreads: defineTable({
    threadKey: v.string(),
    kind: v.union(v.literal("work"), v.literal("duty"), v.literal("group")),
    entityId: v.string(),
    title: v.string(),
    lastBodyText: v.string(),
    lastMessageAt: v.number(),
    lastAuthorUserId: v.string(),
    active: v.boolean(),
    ...timestamps,
  })
    .index("by_thread_key", ["threadKey"])
    .index("by_kind_entity", ["kind", "entityId"]),
  /**
   * Per-user membership, preview, and unread count. List query is
   * by_user_active_activity (bounded take), not a full-table scan.
   */
  chatInbox: defineTable({
    userId: v.string(),
    threadKey: v.string(),
    kind: v.union(v.literal("work"), v.literal("duty"), v.literal("group")),
    entityId: v.string(),
    title: v.string(),
    lastBodyText: v.string(),
    lastMessageAt: v.number(),
    lastAuthorUserId: v.string(),
    lastReadAt: v.number(),
    unreadCount: v.number(),
    active: v.boolean(),
    ...timestamps,
  })
    .index("by_user_active_activity", ["userId", "active", "lastMessageAt"])
    .index("by_user_thread", ["userId", "threadKey"])
    .index("by_thread", ["threadKey"]),
  /** One counter document per user so the sidebar badge is a single read. */
  chatCounters: defineTable({
    userId: v.string(),
    unreadTotal: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  /** User-created group chats. Admin may view/dissolve any active group. */
  chatGroups: defineTable({
    name: v.string(),
    ownerUserId: v.string(),
    memberCount: v.number(),
    lastBodyText: v.string(),
    lastMessageAt: v.number(),
    lastAuthorUserId: v.string(),
    active: v.boolean(),
    createdBy: v.string(),
    ...timestamps,
  }).index("by_active_activity", ["active", "lastMessageAt"]),
  chatGroupMembers: defineTable({
    groupId: v.string(),
    userId: v.string(),
    role: v.union(v.literal("owner"), v.literal("member")),
    active: v.boolean(),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
    ...timestamps,
  })
    .index("by_group_active", ["groupId", "active"])
    .index("by_user_active", ["userId", "active"])
    .index("by_group_user", ["groupId", "userId"]),
  groupMessages: defineTable({
    groupId: v.string(),
    authorUserId: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    active: v.boolean(),
    recalledAt: v.optional(v.number()),
    ...timestamps,
  })
    .index("by_group", ["groupId"])
    .index("by_group_created", ["groupId", "createdAt"]),
  /**
   * Cursor for the one-time inbox backfill of historical work/duty messages.
   * New messages maintain inbox rows directly; this only catches threads
   * that existed before the hub.
   */
  chatHubSync: defineTable({
    scope: v.string(),
    cursor: v.number(),
    done: v.boolean(),
    updatedAt: v.number(),
  }).index("by_scope", ["scope"]),
  /**
   * Personnel fault records (Ghi nhận lỗi) with evidence on Google Drive.
   */
  personnelFaults: defineTable({
    targetUserId: v.string(),
    recordedByUserId: v.string(),
    violationDate: v.string(), // YYYY-MM-DD
    reason: v.string(),
    driveFileId: v.string(),
    driveChecksum: v.optional(v.string()),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_target", ["targetUserId", "active"])
    .index("by_recorder", ["recordedByUserId", "active"])
    .index("by_violation_date", ["active", "violationDate"])
    .index("by_drive_file", ["driveFileId"]),
  /**
   * Evaluation evidence files (offline self-assessment PDFs).
   * kind: quarterly | civil_servant | boarding
   * One active row per target+kind+period; replace bumps versionCount and swaps driveFileId.
   */
  personnelEvaluationFiles: defineTable({
    targetUserId: v.string(),
    kind: v.string(),
    year: v.optional(v.number()),
    quarter: v.optional(v.number()),
    schoolYear: v.optional(v.string()),
    semester: v.optional(v.number()),
    periodKey: v.string(),
    driveFileId: v.string(),
    driveChecksum: v.optional(v.string()),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    uploadedByUserId: v.string(),
    versionCount: v.number(),
    lastUploadedAt: v.number(),
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_target_kind_period", ["targetUserId", "kind", "periodKey"])
    .index("by_target", ["targetUserId", "active"])
    .index("by_drive_file", ["driveFileId"]),
  /** BGH text reviews attached to an evaluation file. One text per evaluator per file. */
  personnelEvaluationTexts: defineTable({
    fileId: v.string(),
    targetUserId: v.string(),
    /** The writer: a BGH member, or admin/mod writing on behalf of BGH. */
    evaluatorUserId: v.string(),
    content: v.string(),
    /**
     * BGH approval (`convex/peopleReviewPolicy.ts`). Missing = legacy, counts as
     * approved. Admin/mod-written comments start `pending`; only `approved`
     * ones lock the file and count, and only those reach the evaluated person.
     */
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("returned"))),
    writtenOnBehalf: v.optional(v.boolean()),
    submittedAt: v.optional(v.number()),
    reviewedByUserId: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    returnReason: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_file", ["fileId", "active"])
    .index("by_target", ["targetUserId", "active"])
    .index("by_file_evaluator", ["fileId", "evaluatorUserId"])
    .index("by_evaluator", ["evaluatorUserId", "active"])
    .index("by_status", ["status", "active"]),
  /** Trusted cleanup queue for file objects (Convex `cvx_` keys or legacy Drive ids) superseded by an atomic metadata update. */
  driveCleanupJobs: defineTable({
    driveFileId: v.string(),
    purpose: v.string(),
    resourceId: v.string(),
    createdBy: v.string(),
    active: v.boolean(),
    ...timestamps,
  })
    .index("by_creator", ["createdBy", "active"]),
  /** Atomic ownership/cleanup state for Drive uploads before CRM records take ownership. */
  driveUploadStages: defineTable({
    cleanupToken: v.string(),
    driveFileId: v.string(),
    purpose: v.string(),
    userId: v.string(),
    status: v.string(),
    claimId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_cleanup_token", ["cleanupToken"])
    .index("by_drive_file", ["driveFileId"]),
  /** Idempotency receipts for atomic multi-section personnel-review saves. */
  peopleReviewSaveRequests: defineTable({
    userId: v.string(),
    requestId: v.string(),
    cleanupJobIds: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_request", ["userId", "requestId"]),
  schoolYears: defineTable({
    name: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    attendanceUploadDueTime: v.string(),
    /** First day of Học kỳ II (YYYY-MM-DD). Học bạ uses it to default each score's semester. */
    semester2StartDate: v.optional(v.string()),
    active: v.boolean(),
    lockedAt: v.optional(v.number()),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_name", ["name"])
    .index("by_active", ["active"]),
  schoolCalendarDays: defineTable({
    schoolYearId: v.string(),
    date: v.string(),
    kind: v.string(),
    note: v.optional(v.string()),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_year_date", ["schoolYearId", "date"])
    .index("by_date", ["date"]),
  homeroomClasses: defineTable({
    schoolYearId: v.string(),
    code: v.string(),
    name: v.string(),
    gradeLevel: v.number(),
    status: v.string(),
    notes: v.optional(v.string()),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_year", ["schoolYearId"])
    .index("by_year_code", ["schoolYearId", "code"]),
  homeroomAssignments: defineTable({
    classId: v.string(),
    schoolYearId: v.string(),
    userId: v.string(),
    assignmentType: v.string(),
    scopeKind: v.string(),
    effectiveFrom: v.string(),
    effectiveTo: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.string(),
    endedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_user_active", ["userId", "active"])
    .index("by_class_type", ["classId", "assignmentType"])
    .index("by_year_user", ["schoolYearId", "userId"]),
  students: defineTable({
    studentCode: v.string(),
    fullName: v.string(),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.string()),
    studentPhone: v.optional(v.string()),
    priorityCategory: v.optional(v.string()),
    ethnicity: v.optional(v.string()),
    hardshipNote: v.optional(v.string()),
    status: v.string(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_code", ["studentCode"])
    .index("by_status", ["status"]),
  studentGuardians: defineTable({
    studentId: v.string(),
    relationship: v.string(),
    fullName: v.string(),
    phone: v.optional(v.string()),
    isPrimaryContact: v.boolean(),
    notes: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_student_active", ["studentId", "active"]),
  classEnrollments: defineTable({
    studentId: v.string(),
    classId: v.string(),
    schoolYearId: v.string(),
    rosterNumber: v.optional(v.number()),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    status: v.string(),
    transferReason: v.optional(v.string()),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_student_year", ["studentId", "schoolYearId"])
    .index("by_class_status", ["classId", "status"])
    .index("by_year_status", ["schoolYearId", "status"]),
  studentRosterImportUploads: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    checksum: v.optional(v.string()),
    uploadedBy: v.string(),
    schoolYearId: v.string(),
    classId: v.string(),
    mode: v.string(),
    status: v.string(),
    rowCount: v.optional(v.number()),
    successCount: v.optional(v.number()),
    errorCount: v.optional(v.number()),
    requestKey: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    committedAt: v.optional(v.number()),
  })
    .index("by_class", ["classId"])
    .index("by_expiresAt", ["expiresAt"]),
  studentRosterImportRows: defineTable({
    uploadId: v.string(),
    rowNumber: v.number(),
    payload: v.string(),
    issues: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_upload", ["uploadId"]),
  attendanceImportUploads: defineTable({
    schoolYearId: v.string(),
    classId: v.optional(v.string()),
    attendanceDate: v.string(),
    sourceKind: v.string(),
    fileName: v.string(),
    fileSize: v.number(),
    checksum: v.string(),
    storageId: v.id("_storage"),
    uploadedBy: v.string(),
    columnMapping: v.object({
      studentCode: v.optional(v.string()),
      studentName: v.optional(v.string()),
      classCode: v.optional(v.string()),
      observedAt: v.optional(v.string()),
      sourceStatus: v.optional(v.string()),
    }),
    presencePolicy: v.string(),
    status: v.string(),
    rowCount: v.number(),
    matchedCount: v.number(),
    warningCount: v.number(),
    errorCount: v.number(),
    publishedAt: v.optional(v.number()),
    supersedesImportId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_date", ["attendanceDate"])
    .index("by_checksum_date", ["checksum", "attendanceDate"])
    .index("by_class_date", ["classId", "attendanceDate"]),
  attendanceImportRows: defineTable({
    importId: v.string(),
    rowNumber: v.number(),
    rawStudentCode: v.optional(v.string()),
    rawStudentName: v.optional(v.string()),
    rawDateOfBirth: v.optional(v.string()),
    rawClassCode: v.optional(v.string()),
    rawObservedAt: v.optional(v.string()),
    rawStatus: v.optional(v.string()),
    matchedStudentId: v.optional(v.string()),
    matchedClassId: v.optional(v.string()),
    resolution: v.string(),
    messages: v.array(v.string()),
    normalizedObservedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_import", ["importId"]),
  studentAttendanceDays: defineTable({
    schoolYearId: v.string(),
    classId: v.string(),
    enrollmentId: v.string(),
    studentId: v.string(),
    attendanceDate: v.string(),
    sourceImportId: v.optional(v.string()),
    rawObservation: v.string(),
    rawObservedAt: v.optional(v.number()),
    disposition: v.string(),
    effectiveStatus: v.string(),
    reasonCode: v.optional(v.string()),
    note: v.optional(v.string()),
    firstPublishedAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_student_date", ["studentId", "attendanceDate"])
    .index("by_class_date", ["classId", "attendanceDate"])
    .index("by_year_date", ["schoolYearId", "attendanceDate"])
    .index("by_year_status_date", ["schoolYearId", "effectiveStatus", "attendanceDate"])
    .index("by_class_status_date", ["classId", "effectiveStatus", "attendanceDate"])
    .index("by_import", ["sourceImportId"]),
  /**
   * One row per class per school day once Giám thị (or admin/mod) saved its attendance on the
   * Điểm danh menu. No row = "Chưa điểm danh". Per-student facts stay in studentAttendanceDays.
   */
  attendanceClassDays: defineTable({
    schoolYearId: v.string(),
    classId: v.string(),
    attendanceDate: v.string(),
    savedBy: v.string(),
    savedAt: v.number(),
    source: v.union(v.literal("manual"), v.literal("import")),
    presentCount: v.number(),
    absentCount: v.number(),
  })
    .index("by_class_date", ["classId", "attendanceDate"])
    .index("by_year_date", ["schoolYearId", "attendanceDate"]),
  /** Staged Giám thị Excel imports (Lớp học / Tên học sinh / Vắng); purged after 1 hour. */
  supervisorAttendanceUploads: defineTable({
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    uploadedBy: v.string(),
    schoolYearId: v.string(),
    attendanceDate: v.string(),
    status: v.string(), // uploaded | committing | committed | expired
    classCount: v.optional(v.number()),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_expiresAt", ["expiresAt"]),
  studentAttendanceCorrections: defineTable({
    attendanceDayId: v.string(),
    studentId: v.string(),
    attendanceDate: v.string(),
    previousDisposition: v.string(),
    nextDisposition: v.string(),
    previousEffectiveStatus: v.string(),
    nextEffectiveStatus: v.string(),
    reasonCode: v.optional(v.string()),
    note: v.optional(v.string()),
    evidenceAttachmentIds: v.optional(v.array(v.string())),
    actorUserId: v.string(),
    at: v.number(),
  })
    .index("by_day", ["attendanceDayId"])
    .index("by_student_date", ["studentId", "attendanceDate"]),
  /**
   * Single-use, short-lived challenges for device-key (vân tay / Face ID) and passkey
   * sign-in / registration. `userId` is set for registration challenges only.
   */
  authChallenges: defineTable({
    purpose: v.string(), // device_login | device_register | passkey_login | passkey_register
    challenge: v.string(), // base64url, 32 random bytes
    userId: v.optional(v.string()),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_expires", ["expiresAt"]),
  /**
   * Sign-in credentials bound to a device: `device_key` = P-256 key in Secure Enclave /
   * Android Keystore unlocked by biometrics; `passkey` = WebAuthn credential. Public keys only.
   */
  deviceCredentials: defineTable({
    userId: v.string(),
    kind: v.string(), // device_key | passkey
    credentialId: v.string(), // base64url
    publicKey: v.string(), // device_key: base64 SPKI DER; passkey: base64url COSE key
    counter: v.optional(v.number()),
    transports: v.optional(v.array(v.string())),
    deviceName: v.string(),
    platform: v.string(), // ios | android
    active: v.boolean(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedReason: v.optional(v.string()),
  })
    .index("by_credential", ["credentialId"])
    .index("by_user", ["userId"]),
  /** Thiết lập Môn học: seeded with the GDPT 2018 THCS subjects; soft-deleted. */
  subjects: defineTable({
    name: v.string(),
    code: v.string(),
    sortOrder: v.number(),
    active: v.boolean(),
    ...timestamps,
  }).index("by_code", ["code"]),
  /** Thiết lập Loại kiểm tra: name + hệ số điểm (weight in the semester average). */
  testTypes: defineTable({
    name: v.string(),
    coefficient: v.number(),
    sortOrder: v.number(),
    active: v.boolean(),
    ...timestamps,
  }),
  /** Môn giảng dạy of one teacher in one school year (Thiết lập Giáo viên). */
  teacherYearProfiles: defineTable({
    schoolYearId: v.string(),
    userId: v.string(),
    subjectIds: v.array(v.string()),
    /**
     * Lớp giảng dạy chosen by the admin. Absent on older rows: the classes the teacher has
     * in the current timetable count instead (teachingData.effectiveTeachingClassIds).
     */
    teachingClassIds: v.optional(v.array(v.string())),
    updatedBy: v.string(),
    ...timestamps,
  })
    .index("by_year_user", ["schoolYearId", "userId"])
    .index("by_user", ["userId"]),
  /**
   * Weekly timetable cell (Thứ 2–6 × buổi sáng/chiều × tiết 1–5) valid from `effectiveFrom`
   * until `effectiveTo` (inclusive, open-ended when absent). A mid-year change ends the old row
   * the day before and inserts a new one, so past lessons keep their teacher.
   */
  timetableSlots: defineTable({
    schoolYearId: v.string(),
    classId: v.string(),
    weekday: v.number(), // 1 = Thứ 2 … 5 = Thứ 6
    session: v.string(), // morning | afternoon
    period: v.number(), // 1 … 5
    teacherId: v.string(),
    subjectId: v.string(),
    effectiveFrom: v.string(),
    effectiveTo: v.optional(v.string()),
    createdBy: v.string(),
    ...timestamps,
  })
    .index("by_class", ["classId"])
    .index("by_teacher_year", ["teacherId", "schoolYearId"])
    .index("by_year", ["schoolYearId"]),
  /** Sổ đầu bài: one rating per taught period (class + date + buổi + tiết). */
  lessonLogs: defineTable({
    schoolYearId: v.string(),
    classId: v.string(),
    date: v.string(),
    session: v.string(),
    period: v.number(),
    teacherId: v.string(),
    subjectId: v.string(),
    rating: v.number(),
    comment: v.string(),
    ...timestamps,
  })
    .index("by_class_date", ["classId", "date"])
    .index("by_teacher_date", ["teacherId", "date"]),
  /** Học bạ: one score. testTypeName/coefficient are snapshots so later catalog edits keep history. */
  gradeEntries: defineTable({
    schoolYearId: v.string(),
    classId: v.string(),
    studentId: v.string(),
    subjectId: v.string(),
    semester: v.number(), // 1 | 2
    testTypeId: v.string(),
    testTypeName: v.string(),
    coefficient: v.number(),
    score: v.number(),
    enteredBy: v.string(),
    updatedBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_student", ["studentId"])
    .index("by_class_subject", ["classId", "subjectId"]),
});
