// Bán trú: fictional boarding periods (kỳ bán trú) and the participant report.
// Mirrors convex/boarding.ts (listAdmin, report). ALL DATA IS FICTIONAL.
import { DAY, T0, USERS, departmentById, menuAccessFor, positionById, userById } from './personas.js';

const PERIODS = [
  { _id: 'bp_2627_1', semester: 1, schoolYear: '2026-2027', participantUserIds: ['u_teacher', 'u_t5', 'u_gvcn', 'u_t6', 'u_t7', 'u_leader', 'u_t8'] },
  { _id: 'bp_2526_2', semester: 2, schoolYear: '2025-2026', participantUserIds: ['u_teacher', 'u_gvcn', 'u_t7', 'u_t8'] },
  { _id: 'bp_2526_1', semester: 1, schoolYear: '2025-2026', participantUserIds: ['u_t5', 'u_gvcn', 'u_t6'] },
].map((row) => ({ ...row, active: true, createdBy: 'u_clerk', updatedBy: 'u_clerk', createdAt: T0 - 40 * DAY, updatedAt: T0 - 40 * DAY, _creationTime: T0 - 40 * DAY }));

const slim = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  departmentName: departmentById(user.departmentId)?.name || '',
  positionName: positionById(user.positionId)?.name || '',
});

const isOps = (user) => user.role === 'admin' || user.role === 'moderator';

function listAdmin() {
  const users = USERS.filter((u) => u.status === 'active').map(slim).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return {
    users,
    periods: PERIODS.map((period) => ({
      ...period,
      participants: period.participantUserIds.map((id) => users.find((u) => u._id === id)).filter(Boolean),
    })),
  };
}

function report(args, { persona }) {
  const access = menuAccessFor(persona);
  const canViewAll = isOps(persona) || access.reports === 'view_all';
  const visible = USERS.filter((u) => u.status === 'active' && (canViewAll || u.departmentId === persona.departmentId));
  const periods = PERIODS.filter((p) => p.participantUserIds.some((id) => visible.some((u) => u._id === id)));
  const selected = periods.find((p) => p._id === args?.periodId) || periods[0] || null;
  const participants = visible
    .filter((u) => selected?.participantUserIds.includes(u._id))
    .map((u) => ({ ...slim(userById(u._id)) }))
    .sort((a, b) => a.departmentName.localeCompare(b.departmentName, 'vi') || a.name.localeCompare(b.name, 'vi'));
  const byDept = new Map();
  for (const p of participants) byDept.set(p.departmentName, [...(byDept.get(p.departmentName) || []), p]);
  return {
    visibilityScope: canViewAll ? 'all' : 'department',
    periods: periods.map((p) => ({ _id: p._id, semester: p.semester, schoolYear: p.schoolYear, participantCount: p.participantUserIds.length })),
    selectedPeriod: selected ? { _id: selected._id, semester: selected.semester, schoolYear: selected.schoolYear } : null,
    groups: [...byDept.entries()].map(([departmentName, list]) => ({ departmentName, participants: list, participantCount: list.length })),
    totalParticipants: participants.length,
  };
}

export const queries = {
  'boarding:listAdmin': listAdmin,
  'boarding:report': report,
};
