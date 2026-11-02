import { buildDutyCreatePreview } from './dutyDisplay';

export default function DutyCreatePreview({ form, catalogs, pending, onCancel, onConfirm }) {
  const preview = buildDutyCreatePreview(form, catalogs);
  return (
    <div className="work-modal-backdrop duty-preview-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="work-modal duty-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duty-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="work-kicker">XEM TRƯỚC</span>
        <h3 id="duty-preview-title">Xác nhận tạo công tác</h3>
        <p className="work-modal-context">Kiểm tra lại thông tin trước khi tạo để tránh tạo nhầm.</p>
        <dl className="duty-preview-list">
          <div>
            <dt>Tên công tác</dt>
            <dd>{preview.title}</dd>
          </div>
          <div>
            <dt>Nội dung công tác</dt>
            <dd>{preview.content}</dd>
          </div>
          <div>
            <dt>Thời gian</dt>
            <dd>
              {preview.timeStart}
              <small>{preview.timeEnd}</small>
            </dd>
          </div>
          <div>
            <dt>Địa điểm</dt>
            <dd>{preview.location}</dd>
          </div>
          {preview.showDepartments ? (
            <>
              <div>
                <dt>Tổ chuyên môn</dt>
                <dd>{preview.departments}</dd>
              </div>
              <div>
                <dt>Phòng ban</dt>
                <dd>{preview.units}</dd>
              </div>
            </>
          ) : null}
          <div>
            <dt>Người tham gia</dt>
            <dd>{preview.participants}</dd>
          </div>
          <div>
            <dt>Thành phần khác</dt>
            <dd>{preview.otherParticipants}</dd>
          </div>
        </dl>
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onCancel} disabled={Boolean(pending)}>
            Hủy
          </button>
          <button type="button" className="work-primary-button" onClick={onConfirm} disabled={Boolean(pending)}>
            {pending ? 'Đang tạo…' : 'Xác nhận tạo'}
          </button>
        </div>
      </section>
    </div>
  );
}
