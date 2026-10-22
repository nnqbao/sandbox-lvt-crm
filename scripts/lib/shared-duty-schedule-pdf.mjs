import { anyApi } from 'convex/server';
import { buildSharedSchedulePayload, scheduleRange } from '../../src/duties/sharedDutySchedule.js';
import { buildSharedDutySchedulePdf } from '../../src/duties/sharedDutySchedulePdf.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseSharedScheduleQuery(searchParams) {
  const mode = String(searchParams.get('mode') || 'week').trim();
  if (mode !== 'week' && mode !== 'month') {
    throw new Error('INVALID_DATE_RANGE');
  }
  const anchor = String(searchParams.get('anchor') || '').trim();
  if (!DATE_RE.test(anchor)) {
    throw new Error('INVALID_DATE_RANGE');
  }
  return { mode, anchor };
}

export async function buildAuthorizedSharedSchedulePdf(client, mode, anchor) {
  const range = scheduleRange(mode, anchor);
  const data = await client.query(anyApi.duties.sharedSchedule, {
    startDate: range.startIso,
    endDate: range.endIso,
  });
  // Working copy with unapproved changes → marked "BẢN NHÁP – CHƯA DUYỆT".
  return buildSharedDutySchedulePdf(buildSharedSchedulePayload(mode, anchor, data));
}
