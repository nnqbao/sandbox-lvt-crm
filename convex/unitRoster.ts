/**
 * Phòng ban (units) roster helpers shared by Công tác and Công việc.
 *
 * A unit is a plain membership group (no permissions). Công tác keeps the
 * unit's current members on the duty (`unitUserIds`) so every participant
 * check stays a simple id lookup; membership changes resync open duties.
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function todayInVietnam(now = Date.now()) {
  return new Date(now + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function sameIds(a: string[] | undefined, b: string[]) {
  const left = [...new Set((a || []).map(String))].sort();
  const right = [...new Set(b.map(String))].sort();
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/** Member user ids of the given units (deduplicated, any account status). */
export async function loadUnitMemberIds(ctx: { db: any }, unitIds: Iterable<string>): Promise<string[]> {
  const ids = new Set<string>();
  for (const unitId of new Set([...unitIds].map(String).filter(Boolean))) {
    const unit = await ctx.db.normalizeId("units", unitId);
    if (!unit) continue;
    const rows = await ctx.db
      .query("unitMembers")
      .withIndex("by_unit", (q: any) => q.eq("unitId", unit))
      .collect();
    for (const row of rows) ids.add(String(row.userId));
  }
  return [...ids];
}

/** Active units by id (unknown or soft-deleted ids are dropped). */
export async function loadUnits(ctx: { db: any }) {
  return (await ctx.db.query("units").collect()) as Array<{ _id: string; name: string; code: string; active: boolean }>;
}

/**
 * Refresh `unitUserIds` (working copy and approved copy) on every duty that
 * still ends today or later and names this unit. Past duties keep the roster
 * they had, so reports stay historical. Never touches approval state.
 */
export async function syncDutiesForUnit(ctx: { db: any }, unitId: string, now = Date.now()) {
  const today = todayInVietnam(now);
  const rows = [
    ...(await ctx.db
      .query("duties")
      .withIndex("by_active_end", (q: any) => q.eq("active", true).gte("endDate", today))
      .collect()),
    ...(await ctx.db
      .query("duties")
      .withIndex("by_active_end", (q: any) => q.eq("active", false).gte("endDate", today))
      .collect()),
  ];
  const target = String(unitId);
  for (const duty of rows) {
    const workingNames = (duty.unitIds || []).map(String).includes(target);
    const publishedNames = (duty.published?.unitIds || []).map(String).includes(target);
    if (!workingNames && !publishedNames) continue;
    const patch: Record<string, unknown> = {};
    if (workingNames) {
      const members = await loadUnitMemberIds(ctx, duty.unitIds || []);
      if (!sameIds(duty.unitUserIds, members)) patch.unitUserIds = members;
    }
    if (publishedNames && duty.published) {
      const members = await loadUnitMemberIds(ctx, duty.published.unitIds || []);
      if (!sameIds(duty.published.unitUserIds, members)) {
        patch.published = { ...duty.published, unitUserIds: members };
      }
    }
    if (Object.keys(patch).length) await ctx.db.patch(duty._id, patch);
  }
}
