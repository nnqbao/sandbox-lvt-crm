import { buildWorkCreatePreview } from './workDisplay';

export default function WorkCreatePreview({ title, fileName, assignments, catalogs, approverNames = null, pending, onCancel, onConfirm }) {
  const needsApproval = Array.isArray(approverNames);
  const preview = buildWorkCreatePreview({ title, fileName, assignments }, catalogs);
  return (
    <div className="work-modal-backdrop duty-preview-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="work-modal duty-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="work-kicker">XEM TRƯỚC</span>
        <h3 id="work-preview-title">Xác nhận tạo công việc</h3>
        <p className="work-modal-context">
          {needsApproval
            ? 'Công việc sẽ được gửi Ban giám hiệu duyệt; người nhận chỉ thấy sau khi được duyệt đủ.'
            : 'Kiểm tra lại thông tin trước khi tạo để tránh tạo nhầm.'}
        </p>
        <dl className="duty-preview-list">
          <div>
            <dt>Tên công việc</dt>
            <dd>{preview.title}</dd>
          </div>
          <div>
            <dt>Tệp đính kèm</dt>
            <dd>{preview.fileName}</dd>
          </div>
          {needsApproval ? (
            <div>
              <dt>Người duyệt</dt>
              <dd>{approverNames.length ? approverNames.join(', ') : '—'}</dd>
            </div>
          ) : null}
          {preview.rows.map((row, index) => (
            <div key={`${row.recipient}-${index}`}>
              <dt>Người nhận {preview.rows.length > 1 ? index + 1 : ''}</dt>
              <dd>
                {row.recipient}
                <small>{row.content}</small>
                <small>Hạn {row.deadline}</small>
              </dd>
            </div>
          ))}
        </dl>
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onCancel} disabled={Boolean(pending)}>
            Hủy
          </button>
          <button type="button" className="work-primary-button" onClick={onConfirm} disabled={Boolean(pending)}>
            {pending ? 'Đang tạo…' : needsApproval ? 'Xác nhận gửi duyệt' : 'Xác nhận tạo'}
          </button>
        </div>
      </section>
    </div>
  );
}
