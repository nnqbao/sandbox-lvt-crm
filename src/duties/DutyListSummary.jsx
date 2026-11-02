import { dutyDisplayTitle, formatDutyDateTimeLine } from './dutyDisplay';

function DutyIcon({ kind }) {
  if (kind === 'content') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3.5h7.2L19 8.3V20.5H7z" />
        <path d="M14.2 3.5V8.3H19M9 12.2h6M9 15.6h6" />
      </svg>
    );
  }
  if (kind === 'location') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s6.5-5.1 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.9 12 21 12 21z" />
        <circle cx="12" cy="10.6" r="2.1" />
      </svg>
    );
  }
  if (kind === 'department') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 20.5V8.2L12 4.5l7.5 3.7v12.3z" />
        <path d="M9.2 20.5v-5.4h5.6v5.4M9.5 10.8h.1M12 10.8h.1M14.5 10.8h.1M9.5 13.6h.1M12 13.6h.1M14.5 13.6h.1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3" />
      <path d="M5.2 19.6c1.1-3.4 3.4-5 6.8-5s5.7 1.6 6.8 5" />
    </svg>
  );
}

function DutyTimingTags({ timing }) {
  if (!timing) return null;
  let tag = null;
  if (timing.isOverdue) tag = <span className="duty-tag overdue">Kết thúc</span>;
  else if (timing.isOngoing) tag = <span className="duty-tag live">Đang diễn ra</span>;
  else if (timing.nearDeadline) tag = <span className="duty-tag near">Gần đến hạn</span>;
  if (!tag) return null;
  return <span className="tag-row">{tag}</span>;
}

function joinNames(names) {
  return names?.length ? names.join(', ') : '—';
}

function DutyEllipsisText({ text, strong = false }) {
  const value = text || '—';
  const props = { className: 'duty-ellipsis', title: value === '—' ? undefined : value };
  return strong ? <strong {...props}>{value}</strong> : <span {...props}>{value}</span>;
}

export default function DutyListSummary({ item }) {
  const allDay = Boolean(item.allDay);
  const startLine = formatDutyDateTimeLine(item.startDate, item.startTime, { allDay });
  const endLine = allDay ? 'Cả ngày' : formatDutyDateTimeLine(item.endDate, item.endTime);
  const location = item.locationNames?.length ? item.locationNames.join(', ') : (item.locationText || '—');
  return (
    <div className="duty-card-body">
      <div className="duty-time-cell">
        <span className="meta-label">Thời gian</span>
        <DutyEllipsisText strong text={startLine} />
        <DutyEllipsisText text={endLine} />
      </div>
      <div className="duty-card-main">
        <div className="duty-title-row">
          <DutyEllipsisText strong text={dutyDisplayTitle(item)} />
          <DutyTimingTags timing={item.timing} />
        </div>
        <div className="duty-detail-cell">
          <span className="meta-label">Chi tiết</span>
          <div className="duty-detail-row">
            <DutyIcon kind="content" />
            <DutyEllipsisText text={item.content || '—'} />
          </div>
          <div className="duty-detail-row">
            <DutyIcon kind="location" />
            <DutyEllipsisText text={location} />
          </div>
          <div className="duty-detail-row">
            <DutyIcon kind="department" />
            <DutyEllipsisText text={joinNames([...(item.departmentNames || []), ...(item.unitNames || [])])} />
          </div>
          <div className="duty-detail-row">
            <DutyIcon kind="people" />
            <DutyEllipsisText
              text={joinNames(
                [...(item.participantNames || []), item.otherParticipants].filter((name) =>
                  String(name || '').trim(),
                ),
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
