/** "Họ tên (vai trò) · HH:mm dd/MM/yyyy" for one history entry. */
export function dutyHistoryHeading(entry) {
  const role = entry?.actorRoleLabel ? ` (${entry.actorRoleLabel})` : '';
  return `${entry?.actorName || 'Người dùng'}${role} · ${entry?.atLabel || ''}`.trim();
}

/** "Địa điểm: A → B"; empty sides read "(trống)". */
export function dutyHistoryChangeLine(change) {
  const before = String(change?.before || '').trim() || '(trống)';
  const after = String(change?.after || '').trim() || '(trống)';
  return `${change?.field || ''}: ${before} → ${after}`;
}
