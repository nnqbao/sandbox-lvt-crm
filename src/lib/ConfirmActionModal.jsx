import React, { useEffect, useId } from 'react';
import '../work/work.css';

export const EDIT_CANCEL_CONFIRM_TITLE = 'Bạn có chắc chắn Hủy sửa không?';
export const EDIT_SAVE_CONFIRM_TITLE = 'Bạn có chắc chắn Lưu không?';

export default function ConfirmActionModal({
  title,
  description = '',
  confirmLabel,
  tone = 'primary',
  pending = false,
  onCancel,
  onConfirm,
}) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !pending) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  return (
    <div
      className="work-modal-backdrop duty-preview-backdrop"
      role="presentation"
      onClick={pending ? undefined : onCancel}
    >
      <section
        className="work-modal work-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="work-kicker">XÁC NHẬN</span>
        <h3 id={titleId}>{title}</h3>
        {description ? <p className="work-confirm-description">{description}</p> : null}
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onCancel} disabled={pending}>
            Hủy
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'work-reject-button' : 'work-primary-button'}
            onClick={onConfirm}
            disabled={pending}
            autoFocus
          >
            {pending ? 'Đang xử lý…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function EditActionConfirm({ action, pending = false, onDismiss, onConfirmCancel, onConfirmSave }) {
  if (!action) return null;
  const isCancel = action === 'cancel';
  return (
    <ConfirmActionModal
      title={isCancel ? EDIT_CANCEL_CONFIRM_TITLE : EDIT_SAVE_CONFIRM_TITLE}
      confirmLabel={isCancel ? 'Hủy sửa' : 'Lưu'}
      pending={pending}
      onCancel={onDismiss}
      onConfirm={isCancel ? onConfirmCancel : onConfirmSave}
    />
  );
}
