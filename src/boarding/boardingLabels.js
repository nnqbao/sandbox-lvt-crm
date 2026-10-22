/**
 * One wording for a boarding period everywhere (management, reports, people review):
 * "Học kỳ 1 · Năm học 2026-2027". `short` drops the year: "Học kỳ 1".
 */
export function boardingPeriodLabel(period, { short = false } = {}) {
  if (!period) return '';
  const term = `Học kỳ ${period.semester}`;
  return short || !period.schoolYear ? term : `${term} · Năm học ${period.schoolYear}`;
}
