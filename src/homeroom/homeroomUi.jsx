import React, { useCallback, useEffect, useRef, useState } from 'react';
import { messageFor } from '../lib/appErrorMessage';
import { studentQueryErrorBoundaryState } from './studentQueryErrorBoundary';
import { addDays, formatDateLong, isYmd, STATUS_SHORT, statusLabel } from './homeroomLabels';

const ICONS = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.5 13.5 6 5.5h12l2.5 8" />
      <path d="M3.5 13.5V19a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-5.5h-5l-1.5 2.5h-4l-1.5-2.5z" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11.5" />
      <path d="m7.5 11 4.5 4.5 4.5-4.5" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  classes: (
    <>
      <path d="M4 6.5 12 3l8 3.5-8 3.5z" />
      <path d="M7 8.5V14c0 1.6 2.2 3 5 3s5-1.4 5-3V8.5" />
      <path d="M20 6.5v6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19.5c.9-3.2 2.9-4.8 5.5-4.8s4.6 1.6 5.5 4.8" />
      <circle cx="16.8" cy="8.6" r="2.3" />
      <path d="M15.6 14.6c2.2 0 3.9 1.2 4.7 3.6" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronUp: <path d="m6 14.5 6-6 6 6" />,
  arrowRight: (
    <>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M19.5 12h-15" />
      <path d="m10.5 6-6 6 6 6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  phone: <path d="M6.5 3.5h3l1.5 4-2 1.3a10.5 10.5 0 0 0 6.2 6.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />,
  edit: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="m14.5 7.5 3 3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  alert: (
    <>
      <path d="M12 3.5 2.8 19.5h18.4z" />
      <path d="M12 10v4.2M12 17.2v.1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  archive: (
    <>
      <rect x="3.5" y="4" width="17" height="4.5" rx="1" />
      <path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5" />
      <path d="M10 12.5h4" />
    </>
  ),
  restore: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4.5h4.5" />
    </>
  ),
  transfer: (
    <>
      <path d="M4 8h13.5" />
      <path d="m14 4.5 3.5 3.5L14 11.5" />
      <path d="M20 16H6.5" />
      <path d="m10 12.5-3.5 3.5 3.5 3.5" />
    </>
  ),
  leave: (
    <>
      <path d="M14 4.5h4A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-4" />
      <path d="M10 16.5 5.5 12 10 7.5" />
      <path d="M5.5 12h10" />
    </>
  ),
  file: (
    <>
      <path d="M6.5 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z" />
      <path d="M13.5 3.5v4h4" />
      <path d="M8.5 12.5h7M8.5 16h5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19.5v-8" />
      <path d="M10 19.5v-14" />
      <path d="M16 19.5v-6" />
      <path d="M21 19.5H3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
      <circle cx="12" cy="12" r="2.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="M6.5 7l1 12.5h9l1-12.5" />
    </>
  ),
};

export function Icon({ name, size = 16, strokeWidth = 1.8, className = undefined }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICONS[name] || null}
    </svg>
  );
}

export function StatusChip({ status = 'no_data', short = false }) {
  const key = status || 'no_data';
  return (
    <span className={`hr-chip hr-chip--${key}`}>
      <span className="hr-chip-dot" aria-hidden="true" />
      {short ? STATUS_SHORT[key] || statusLabel(key) : statusLabel(key)}
    </span>
  );
}

export function Feedback({ error = '', success = '' }) {
  return (
    <>
      {error ? (
        <p className="hr-alert hr-alert--error" role="alert">
          <Icon name="alert" size={15} />
          <span>{error}</span>
        </p>
      ) : null}
      {success ? (
        <p className="hr-alert hr-alert--success" role="status">
          <Icon name="check" size={15} />
          <span>{success}</span>
        </p>
      ) : null}
    </>
  );
}

export function Notice({ tone = 'info', icon = 'alert', title = undefined, children = undefined, action = undefined }) {
  return (
    <div className={`hr-notice hr-notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="hr-notice-icon"><Icon name={icon} size={17} /></span>
      <div className="hr-notice-body">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action ? <div className="hr-notice-action">{action}</div> : null}
    </div>
  );
}

export function Loading({ label = 'Đang tải…' }) {
  return (
    <div className="hr-loading" role="status" aria-live="polite">
      <span className="hr-loading-bar" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, children = undefined, action = undefined }) {
  return (
    <div className="hr-empty">
      <span className="hr-empty-icon"><Icon name={icon} size={26} strokeWidth={1.5} /></span>
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
      {action || null}
    </div>
  );
}

export function Kpi({ label, value, hint = undefined, tone = 'neutral', onClick = undefined, active = false, icon = undefined }) {
  const content = (
    <>
      <span className="hr-kpi-label">
        {icon ? <Icon name={icon} size={14} /> : null}
        {label}
      </span>
      <strong className="hr-kpi-value">{value}</strong>
      {hint ? <span className="hr-kpi-hint">{hint}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`hr-kpi hr-kpi--${tone} is-clickable`} aria-pressed={active} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className={`hr-kpi hr-kpi--${tone}`}>{content}</div>;
}

/** Thanh tỷ lệ xếp chồng: có mặt / trễ / chờ xử lý / có phép / không phép / chưa có dữ liệu. */
export function AttendanceBar({ counts = {}, total = 0, compact = false }) {
  const order = ['present', 'late', 'absent_pending', 'absent_excused', 'absent_unexcused'];
  const known = order.reduce((sum, key) => sum + (counts[key] || 0), 0);
  const base = Math.max(total || 0, known, 1);
  return (
    <div className={`hr-bar${compact ? ' hr-bar--compact' : ''}`} role="img" aria-label={order.map((key) => `${STATUS_SHORT[key]} ${counts[key] || 0}`).join(', ')}>
      {order.map((key) =>
        counts[key] ? (
          <span key={key} className={`hr-bar-seg hr-bar-seg--${key}`} style={{ width: `${((counts[key] || 0) / base) * 100}%` }} />
        ) : null,
      )}
    </div>
  );
}

export function Modal({ title, subtitle = undefined, onClose, children = undefined, footer = undefined, size = 'md', busy = false }) {
  const panelRef = useRef(null);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    const first = panelRef.current?.querySelector('input:not([type=hidden]), select, textarea, button.hr-modal-focus');
    first?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <div
      className="hr-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <div ref={panelRef} className={`hr-modal hr-modal--${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="hr-modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="hr-icon-button" onClick={onClose} disabled={busy} aria-label="Đóng">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="hr-modal-body">{children}</div>
        {footer ? <footer className="hr-modal-foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function DateStepper({ value, onChange, min = undefined, max = undefined, label = 'Ngày', skipWeekend = false }) {
  const step = (delta) => {
    let next = addDays(value, delta);
    if (skipWeekend) {
      while ([0, 6].includes(new Date(`${next}T00:00:00Z`).getUTCDay())) next = addDays(next, delta);
    }
    if (min && next < min) return;
    if (max && next > max) return;
    onChange(next);
  };
  return (
    <div className="hr-date-stepper">
      <button type="button" className="hr-icon-button" onClick={() => step(-1)} disabled={Boolean(min && value <= min)} aria-label="Ngày trước">
        <Icon name="chevronLeft" size={18} />
      </button>
      <label className="hr-date-field">
        <span className="hr-sr-only">{label}</span>
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(event) => {
            const next = event.target.value;
            if (isYmd(next)) onChange(next);
          }}
        />
        <span className="hr-date-caption" aria-hidden="true">{formatDateLong(value)}</span>
      </label>
      <button type="button" className="hr-icon-button" onClick={() => step(1)} disabled={Boolean(max && value >= max)} aria-label="Ngày sau">
        <Icon name="chevronRight" size={18} />
      </button>
    </div>
  );
}

/** Chạy một thao tác bất đồng bộ với trạng thái pending/lỗi/thành công thống nhất. */
export function useAsyncTask() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const run = useCallback(async (task, successMessage = '') => {
    setPending(true);
    setError('');
    setSuccess('');
    try {
      const result = await task();
      if (successMessage) setSuccess(successMessage);
      return { ok: true, result };
    } catch (err) {
      setError(messageFor(err));
      return { ok: false, error: err };
    } finally {
      setPending(false);
    }
  }, []);
  const reset = useCallback(() => {
    setError('');
    setSuccess('');
  }, []);
  return { pending, error, success, run, reset, setError, setSuccess };
}

export const VIEW_ERROR_TITLE = 'Không thể tải nội dung này.';

export function HomeroomViewErrorFallback({ error, onBack = undefined, title = VIEW_ERROR_TITLE, backLabel = 'Về tổng quan', onRetry = undefined }) {
  return (
    <div className="hr-panel hr-error-panel" role="alert">
      <span className="hr-empty-icon"><Icon name="alert" size={24} /></span>
      <h2>{title}</h2>
      <p>{messageFor(error)}</p>
      <div className="hr-row">
        {onRetry ? <button type="button" className="hr-button" onClick={onRetry}>Thử lại</button> : null}
        {onBack ? <button type="button" className="primary-button" onClick={onBack}>{backLabel}</button> : null}
      </div>
    </div>
  );
}

/** Bao mỗi màn hình con: lỗi truy vấn (sai ngày, hết quyền…) chỉ thay vùng này, không làm trắng CRM. */
export class HomeroomViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return studentQueryErrorBoundaryState(error);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <HomeroomViewErrorFallback
          error={this.state.error}
          title={this.props.title}
          onBack={this.props.onBack}
          backLabel={this.props.backLabel}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

/** Dùng cho phần phụ (huy hiệu, gợi ý): lỗi thì ẩn đi, không chiếm chỗ. */
export class SilentBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return studentQueryErrorBoundaryState(error);
  }

  render() {
    return this.state.error ? null : this.props.children;
  }
}
