import { Component, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { dutyHistoryChangeLine, dutyHistoryHeading } from './dutyHistoryFormat.js';

class HistoryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const forbidden = /FORBIDDEN/.test(String(this.state.error?.message || ''));
    return (
      <p className="duty-history-state is-error" role="alert">
        {forbidden ? 'Bạn không có quyền xem lịch sử chỉnh sửa của công tác này.' : 'Không tải được lịch sử chỉnh sửa. Vui lòng thử lại sau.'}
      </p>
    );
  }
}

function HistoryQuery({ dutyId }) {
  const entries = useQuery(anyApi.duties.changeHistory, { dutyId });
  if (entries === undefined) return <p className="duty-history-state">Đang tải lịch sử…</p>;
  if (!entries.length) {
    return <p className="duty-history-state">Chưa có lịch sử chỉnh sửa. Các thay đổi từ nay sẽ được ghi lại tại đây.</p>;
  }
  return (
    <ol className="duty-history-list">
      {entries.map((entry) => (
        <li key={entry._id}>
          <p className="duty-history-heading">
            <strong>{dutyHistoryHeading(entry)}</strong>
            <span>{entry.actionLabel}</span>
          </p>
          {entry.changes?.length ? (
            <ul>
              {entry.changes.map((change, index) => (
                <li key={`${entry._id}-${index}`}>{dutyHistoryChangeLine(change)}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * "Lịch sử chỉnh sửa" disclosure. Only rendered when the server marked the
 * duty `canViewHistory`; `duties.changeHistory` re-checks and returns FORBIDDEN
 * otherwise. Loads lazily on first open; no modal so it can live inside one.
 */
export default function DutyChangeHistory({ dutyId }) {
  const [open, setOpen] = useState(false);
  if (!dutyId) return null;
  return (
    <section className="duty-history">
      <button
        type="button"
        className="work-ghost-button duty-history-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Ẩn lịch sử chỉnh sửa' : 'Lịch sử chỉnh sửa'}
      </button>
      {open ? (
        <HistoryBoundary>
          <HistoryQuery dutyId={dutyId} />
        </HistoryBoundary>
      ) : null}
    </section>
  );
}
