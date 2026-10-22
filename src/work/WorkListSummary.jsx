import {
  formatWorkDate,
  workContentSummary,
  workDeadlineKey,
  workLastEditedLabel,
  workListTitle,
  workRecipientSummary,
} from './workDisplay';

function WorkIcon({ kind }) {
  if (kind === 'file') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3.5h7.2L19 8.3V20.5H7z" />
        <path d="M14.2 3.5V8.3H19" />
      </svg>
    );
  }
  if (kind === 'people') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8.2" r="3" />
        <path d="M5.2 19.6c1.1-3.4 3.4-5 6.8-5s5.7 1.6 6.8 5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h7.2L19 8.3V20.5H7z" />
      <path d="M14.2 3.5V8.3H19M9 12.2h6M9 15.6h6" />
    </svg>
  );
}

function Ellipsis({ text, strong = false }) {
  const value = text || '—';
  const props = { className: 'duty-ellipsis', title: value === '—' ? undefined : value };
  return strong ? <strong {...props}>{value}</strong> : <span {...props}>{value}</span>;
}

export default function WorkListSummary({ item, status = null }) {
  const deadline = formatWorkDate(workDeadlineKey(item) || item?.deadline);
  // Shown to everyone who sees the work (creator, approvers, assignees, managers).
  const editedLabel = workLastEditedLabel(item);
  return (
    <div className="duty-card-body">
      <div className="duty-time-cell">
        <span className="meta-label">Hạn chót</span>
        <Ellipsis strong text={deadline} />
      </div>
      <div className="duty-card-main">
        <div className="duty-title-row">
          <Ellipsis strong text={workListTitle(item)} />
          {status}
        </div>
        <div className="duty-detail-cell">
          <span className="meta-label">Chi tiết</span>
          <div className="duty-detail-row">
            <WorkIcon kind="content" />
            <Ellipsis text={workContentSummary(item)} />
          </div>
          <div className="duty-detail-row">
            <WorkIcon kind="people" />
            <Ellipsis text={workRecipientSummary(item)} />
          </div>
          {item?.fileName ? (
            <div className="duty-detail-row">
              <WorkIcon kind="file" />
              <Ellipsis text={item.fileName} />
            </div>
          ) : null}
          {editedLabel ? <span className="work-edited-note">{editedLabel}</span> : null}
        </div>
      </div>
    </div>
  );
}
