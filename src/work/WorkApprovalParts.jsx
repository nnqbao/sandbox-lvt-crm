import { useState } from 'react';
import { formatWorkDateTime, workApproverDecisionLabel, workCreatorLabel } from './workDisplay';

export const WORK_APPROVAL_NOTE = 'Công việc do Văn thư/Quản trị tạo cần Ban giám hiệu duyệt trước khi giao.';

/** Required multi-select of Ban giám hiệu approvers (ops create/edit form only). */
export function WorkApproverPicker({ approvers = [], value = [], onChange, error = '' }) {
  const selected = new Set(value.map(String));
  const toggle = (id) => {
    const key = String(id);
    onChange(selected.has(key) ? value.filter((item) => String(item) !== key) : [...value, key]);
  };
  return (
    <fieldset className="work-approver-block" aria-describedby="work-approver-note">
      <legend className="work-field-label">
        <span>Người duyệt (Ban giám hiệu) <b aria-hidden="true">*</b></span>
        <small>{value.length} người đã chọn</small>
      </legend>
      <p id="work-approver-note" className="work-approval-note">{WORK_APPROVAL_NOTE}</p>
      <div className="work-approver-list">
        {approvers.map((person) => {
          const checked = selected.has(String(person._id));
          return (
            <label key={person._id} className={checked ? 'is-selected' : ''}>
              <input type="checkbox" checked={checked} onChange={() => toggle(person._id)} />
              <span className="work-person-avatar" aria-hidden="true">
                {String(person.name || '?').trim().slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{person.name}</strong>
                <small>{person.level} sao · {person.positionName || 'Chưa gán chức vụ'}</small>
              </span>
            </label>
          );
        })}
        {!approvers.length ? (
          <p className="work-muted">Chưa có thành viên Ban giám hiệu (cấp 4 hoặc 5 sao) đang hoạt động.</p>
        ) : null}
      </div>
      {error ? <p className="work-field-error" role="alert">{error}</p> : null}
    </fieldset>
  );
}

/** Approval progress x/y with who decided and when; return reason when sent back. */
export function WorkApprovalProgress({ document }) {
  const approvers = document?.approvers || [];
  if (!approvers.length && !document?.approvalTotal) return null;
  return (
    <div className="work-approval-progress">
      <span className="work-approval-count">
        Ban giám hiệu duyệt <strong>{document.approvalCount || 0}/{document.approvalTotal || approvers.length}</strong>
      </span>
      <div className="work-approver-chips">
        {approvers.map((approver) => (
          <span
            key={approver._id}
            className={`work-approver-chip ${approver.approved ? 'is-approved' : approver.rejected ? 'is-returned' : 'is-waiting'}`}
          >
            {approver.name} · {workApproverDecisionLabel(approver)}
          </span>
        ))}
      </div>
      {document.status === 'rejected' && document.returnReason ? (
        <p className="work-approval-reason">
          <strong>Lý do trả lại:</strong> {document.returnReason}
        </p>
      ) : null}
    </div>
  );
}

/** Approve (confirm, irreversible lock) or return with a required reason. */
export function WorkDocumentDecisionModal({ document, mode, onClose, onSubmit, saving }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const returning = mode === 'reject';
  const submit = (event) => {
    event.preventDefault();
    if (returning && !reason.trim()) {
      setError('Vui lòng nhập lý do trả lại.');
      return;
    }
    onSubmit(returning ? { decision: 'reject', reason: reason.trim() } : { decision: 'approve' });
  };
  return (
    <div className="work-modal-backdrop" role="presentation">
      <form
        className="work-modal"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-decision-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <button type="button" className="work-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="work-kicker">{returning ? 'Trả lại công việc' : 'Duyệt công việc'}</span>
        <h3 id="work-decision-title">{document.title || document.fileName}</h3>
        <p className="work-modal-context">
          {workCreatorLabel(document)}
          {document.submittedAt ? ` · gửi lúc ${formatWorkDateTime(document.submittedAt)}` : ''}
        </p>
        {returning ? (
          <>
            <label className="work-field-label" htmlFor="work-return-reason">Lý do trả lại (bắt buộc)</label>
            <textarea
              id="work-return-reason"
              rows={4}
              maxLength={500}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError('');
              }}
              required
              aria-invalid={Boolean(error)}
            />
            {error ? <p className="work-field-error" role="alert">{error}</p> : null}
            <p className="work-muted">Người tạo sẽ sửa và gửi duyệt lại.</p>
          </>
        ) : (
          <p className="work-muted">
            Sau khi bạn duyệt, công việc không thể sửa hoặc xóa nữa. Khi đủ người duyệt, công việc được giao ngay cho người nhận.
          </p>
        )}
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onClose} disabled={saving}>Đóng</button>
          <button type="submit" className={returning ? 'work-reject-button' : 'work-primary-button'} disabled={saving}>
            {saving ? 'Đang lưu…' : returning ? 'Trả lại' : 'Duyệt'}
          </button>
        </div>
      </form>
    </div>
  );
}
