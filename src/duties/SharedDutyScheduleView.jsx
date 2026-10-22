import { useEffect, useMemo, useState } from 'react';
import { anyApi } from 'convex/server';
import DutyWorkspaceTabs from './DutyWorkspaceTabs';
import DutyBulkImport from './DutyBulkImport';
import DutyEditModal, { dutyEditModeFor } from './DutyEditModal';
import DutyScheduleTable from './DutyScheduleTable';
import DutyWeekApprovalBar from './DutyWeekApprovalBar';
import { dutyWeekPill, formatWeekRange, shouldShowUnapprovedNotice } from './dutyWeekApproval.js';
import {
  buildSharedSchedulePayload,
  buildSharedScheduleRows,
  shiftScheduleAnchor,
  toIsoDate,
} from './sharedDutySchedule.js';
import { useCachedDutySchedule } from './useCachedDutySchedule.js';
import './sharedDutySchedule.css';

export default function SharedDutyScheduleView({ onChooseView, currentUserId = '', focusWeek = null, canCreate = false }) {
  const [importOpen, setImportOpen] = useState(false);
  const [mode, setMode] = useState('week');
  const [anchorIso, setAnchorIso] = useState(() => focusWeek?.weekStart || toIsoDate(new Date()));

  useEffect(() => {
    if (!focusWeek?.weekStart) return;
    setMode('week');
    setAnchorIso(focusWeek.weekStart);
  }, [focusWeek?.token, focusWeek?.weekStart]);
  const [editingEvent, setEditingEvent] = useState(null);
  const rangePreview = useMemo(() => buildSharedScheduleRows(mode, anchorIso, []).range, [mode, anchorIso]);
  const data = useCachedDutySchedule({
    userId: currentUserId,
    view: 'shared',
    mode,
    startDate: rangePreview.startIso,
    endDate: rangePreview.endIso,
    revisionQuery: anyApi.duties.sharedScheduleRevision,
    dataQuery: anyApi.duties.sharedSchedule,
    queryArgs: {
      startDate: rangePreview.startIso,
      endDate: rangePreview.endIso,
    },
  });
  const events = data?.events || [];
  const viewer = data?.viewer || 'public';
  const weeks = data?.weeks || [];
  const currentWeek = mode === 'week' ? weeks.find((week) => week.weekStart === rangePreview.startIso) : null;
  const built = useMemo(
    () => buildSharedSchedulePayload(mode, anchorIso, data),
    [mode, anchorIso, data],
  );

  const downloading = async () => {
    const { downloadSharedDutySchedulePdf: savePdf } = await import('./sharedDutySchedulePdf.js');
    savePdf(built);
  };

  const openEditor = (row) => {
    const event = events.find((item) => String(item._id) === String(row.eventId));
    if (!dutyEditModeFor(event)) return;
    setEditingEvent(event);
  };

  useEffect(() => {
    if (!editingEvent?._id) return;
    const next = events.find((item) => String(item._id) === String(editingEvent._id));
    if (next && next !== editingEvent) setEditingEvent(next);
    if (data !== undefined && !next) setEditingEvent(null);
  }, [data, events, editingEvent?._id]);

  return (
    <section className="duty-workspace lct-shared-view">
      <DutyWorkspaceTabs
        view="shared"
        onChoose={onChooseView}
        canCreate={canCreate}
        onCreate={() => onChooseView('create')}
        onImport={() => setImportOpen(true)}
      />
      {canCreate && importOpen ? <DutyBulkImport onClose={() => setImportOpen(false)} /> : null}
      <div className="lct-shared-toolbar">
        <div className="lct-shared-toolbar-center">
          <div className="lct-period-nav" role="group" aria-label="Chọn kỳ">
            <button type="button" onClick={() => setAnchorIso((current) => shiftScheduleAnchor(mode, current, -1))} aria-label="Kỳ trước">
              ‹
            </button>
            <button type="button" className="lct-today" onClick={() => setAnchorIso(toIsoDate(new Date()))}>
              Hôm nay
            </button>
            <button type="button" onClick={() => setAnchorIso((current) => shiftScheduleAnchor(mode, current, 1))} aria-label="Kỳ sau">
              ›
            </button>
          </div>
          <div className="lct-mode-switch" role="group" aria-label="Kiểu hiển thị">
            <button type="button" className={mode === 'week' ? 'is-active' : undefined} onClick={() => setMode('week')}>
              Tuần
            </button>
            <button type="button" className={mode === 'month' ? 'is-active' : undefined} onClick={() => setMode('month')}>
              Tháng
            </button>
          </div>
        </div>
        <div className="lct-download">
          <button
            type="button"
            className="work-primary-button"
            disabled={data === undefined}
            onClick={() => void downloading()}
          >
            Tải PDF
          </button>
        </div>
      </div>

      {data !== undefined && currentWeek ? (
        <DutyWeekApprovalBar week={currentWeek} canSubmit={Boolean(data.canSubmit)} canReview={Boolean(data.canReview)} />
      ) : null}

      {data !== undefined && mode === 'month' && viewer !== 'public' && weeks.length ? (
        <ul className="lct-month-weeks" aria-label="Trạng thái duyệt từng tuần">
          {weeks.map((week) => (
            <li key={week.weekStart} className={`is-${week.status}`}>
              <span>Tuần {formatWeekRange(week.weekStart)}</span>
              <span className="lct-week-pill">{dutyWeekPill(week.status)}</span>
              <button
                type="button"
                className="work-ghost-button"
                onClick={() => {
                  setMode('week');
                  setAnchorIso(week.weekStart);
                }}
              >
                Xem tuần
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {data === undefined ? (
        <p className="lct-loading">Đang dựng lịch công tác chung…</p>
      ) : shouldShowUnapprovedNotice({ viewer, mode, eventCount: events.length }) ? (
        <div className="lct-unapproved-notice" role="status">
          <strong>Lịch tuần này chưa được duyệt</strong>
          <span>Nhà trường sẽ công bố lịch công tác sau khi Ban Giám hiệu duyệt.</span>
        </div>
      ) : (
        <DutyScheduleTable
          title={built.range.title}
          rows={built.rows}
          draft={built.draft}
          onEditContent={openEditor}
        />
      )}

      {editingEvent ? (
        <DutyEditModal
          duty={editingEvent}
          mode={dutyEditModeFor(editingEvent) || 'manager'}
          onClose={() => setEditingEvent(null)}
        />
      ) : null}
    </section>
  );
}
