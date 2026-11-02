/**
 * Turns the assignment rows of a work document into work items (pure policy).
 *
 * Rows:
 * - `department` (Tổ chuyên môn): one collective item on the live roster
 *   (members minus admin/mod, approvers and anyone with an individual item of
 *   the same document — see `departmentRosterMembers` in work.ts).
 * - `unit` (Phòng ban): one individual-type item for the unit's members at save
 *   time, labelled with `unitId`.
 * - `individual` (Cá nhân): one individual item per row.
 *
 * Owner rule (duplicate work): a person reached by more than one row gets
 * personal work that belongs to no Tổ/Phòng ban. They leave every Tổ roster
 * (because they hold an individual item) and every Phòng ban item; the
 * content of each Phòng ban row that reached them follows them as a plain
 * individual item, merged with an identical Cá nhân row (same content and
 * deadline) so nobody gets the same task twice.
 */

export type PlanAssignment = {
  type: "department" | "unit" | "individual";
  departmentId: string;
  unitId?: string;
  /** individual: assignees; unit: the unit's eligible members. */
  userIds: string[];
  content: string;
  deadline: string;
};

export type PlannedWorkItem = {
  assignmentType: "department" | "individual";
  departmentId: string;
  unitId?: string;
  assigneeUserIds: string[];
  content: string;
  deadline: string;
};

function taskKey(content: string, deadline: string) {
  return JSON.stringify([String(content || ""), String(deadline || "")]);
}

export function planWorkItems(
  assignments: PlanAssignment[],
  options: {
    /** User ids a Tổ row reaches (same rule as the live department roster). */
    departmentRosterIds: (departmentId: string) => Iterable<string>;
    /** Tổ chuyên môn of a user, for the item's legacy `departmentId` column. */
    departmentOfUser: (userId: string) => string;
  },
): PlannedWorkItem[] {
  const coverage = new Map<string, number>();
  const bump = (userId: string) => coverage.set(userId, (coverage.get(userId) || 0) + 1);
  for (const row of assignments) {
    const ids = row.type === "department"
      ? new Set([...options.departmentRosterIds(row.departmentId)].map(String))
      : new Set(row.userIds.map(String));
    for (const id of ids) bump(id);
  }

  // Tasks a person already holds through Cá nhân rows.
  const explicitKeys = new Map<string, Set<string>>();
  for (const row of assignments) {
    if (row.type !== "individual") continue;
    for (const id of row.userIds.map(String)) {
      const keys = explicitKeys.get(id) || new Set<string>();
      keys.add(taskKey(row.content, row.deadline));
      explicitKeys.set(id, keys);
    }
  }

  const items: PlannedWorkItem[] = [];
  const splitGroups = new Map<string, { content: string; deadline: string; userIds: string[] }>();
  for (const row of assignments) {
    if (row.type === "department") {
      items.push({
        assignmentType: "department",
        departmentId: row.departmentId,
        assigneeUserIds: [],
        content: row.content,
        deadline: row.deadline,
      });
      continue;
    }
    if (row.type === "individual") {
      items.push({
        assignmentType: "individual",
        departmentId: row.departmentId,
        assigneeUserIds: [...new Set(row.userIds.map(String))],
        content: row.content,
        deadline: row.deadline,
      });
      continue;
    }
    const members = [...new Set(row.userIds.map(String))];
    const keep = members.filter((id) => (coverage.get(id) || 0) <= 1);
    if (keep.length) {
      items.push({
        assignmentType: "individual",
        departmentId: "",
        unitId: row.unitId,
        assigneeUserIds: keep,
        content: row.content,
        deadline: row.deadline,
      });
    }
    const key = taskKey(row.content, row.deadline);
    for (const id of members) {
      if ((coverage.get(id) || 0) <= 1) continue;
      if (explicitKeys.get(id)?.has(key)) continue;
      const group = splitGroups.get(key) || { content: row.content, deadline: row.deadline, userIds: [] };
      if (!group.userIds.includes(id)) group.userIds.push(id);
      splitGroups.set(key, group);
    }
  }
  for (const group of splitGroups.values()) {
    items.push({
      assignmentType: "individual",
      departmentId: options.departmentOfUser(group.userIds[0]) || "",
      assigneeUserIds: group.userIds,
      content: group.content,
      deadline: group.deadline,
    });
  }
  return items;
}
