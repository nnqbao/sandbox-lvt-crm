import { useRef, useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { anyApi } from 'convex/server';
import { assertImportFileMeta } from '../lib/userImport.js';
import { downloadDutyImportTemplate } from '../lib/dutyImportExcel.js';
import { formatVnDate } from './sharedDutySchedule.js';

function formatPreviewTime(row) {
  if (row.allDay) return `${formatVnDate(row.startDate)} · Cả ngày`;
  return `${formatVnDate(row.startDate)} ${row.startTime} → ${formatVnDate(row.endDate)} ${row.endTime}`;
}

export default function DutyBulkImport({ onClose, onImported = null }) {
  const fileInputRef = useRef(null);
  const generateUploadUrl = useMutation(anyApi.dutyImport.generateUploadUrl);
  const registerUpload = useMutation(anyApi.dutyImport.registerUpload);
  const validateUpload = useAction(anyApi.dutyImport.validateUpload);
  const commitImport = useAction(anyApi.dutyImport.commit);

  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [errors, setErrors] = useState([]);
  const [preview, setPreview] = useState([]);
  const [uploadId, setUploadId] = useState(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);

  const resetStage = () => {
    setErrors([]);
    setPreview([]);
    setUploadId(null);
    setFileName('');
    setResult(null);
  };

  const handlePickFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBusy('upload');
    setFeedback({ type: '', text: '' });
    setResult(null);
    setErrors([]);
    setPreview([]);

    try {
      const meta = assertImportFileMeta(file);
      if (!meta.ok) {
        setFeedback({ type: 'error', text: meta.message });
        setBusy('');
        return;
      }

      const uploadUrl = await generateUploadUrl({});
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type':
            file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error('IMPORT_UPLOAD_FAILED');
      const { storageId } = await uploadResponse.json();
      const registered = await registerUpload({
        storageId,
        fileName: file.name,
        fileSize: file.size,
      });

      setUploadId(registered.uploadId);
      setFileName(file.name);
      setBusy('validate');
      const validation = await validateUpload({ uploadId: registered.uploadId });
      if (!validation.ok) {
        setErrors(validation.errors || []);
        setPreview([]);
        setFeedback({
          type: 'error',
          text: `File đã lưu trên server nhưng có ${validation.errors.length} lỗi. Sửa file rồi import lại (file hiện tại tự xóa sau 1 giờ).`,
        });
        return;
      }

      setErrors([]);
      setPreview(validation.preview || []);
      setFeedback({
        type: 'ok',
        text: `Đã tải lên server và hợp lệ (${validation.preview.length} dòng). Kiểm tra xem trước rồi xác nhận import.`,
      });
    } catch (error) {
      const message = String(error?.message || error || '');
      setFeedback({
        type: 'error',
        text: message.includes('IMPORT_FILE_TOO_LARGE')
          ? 'File vượt quá giới hạn 2 MB.'
          : message.includes('INVALID_IMPORT_FILE')
            ? 'Chỉ chấp nhận file Excel (.xlsx).'
            : message.includes('ASSIGNMENT_CREATE_FORBIDDEN')
              ? 'Tài khoản không được tạo công tác.'
              : 'Không thể tải / kiểm tra file import. Vui lòng thử lại.',
      });
      resetStage();
    } finally {
      setBusy('');
    }
  };

  const handleCommit = async () => {
    if (!uploadId || !preview.length) return;
    setBusy('commit');
    try {
      const committed = await commitImport({ uploadId });
      setResult(committed);
      setPreview([]);
      setFeedback({
        type: 'ok',
        text: `Đã import thành công ${committed.createdCount} công tác.`,
      });
      onImported?.();
    } catch (error) {
      const message = String(error?.message || error || '');
      setFeedback({
        type: 'error',
        text: message.includes('IMPORT_VALIDATION_FAILED')
          ? 'Dữ liệu trên server không còn hợp lệ. Vui lòng import lại file.'
          : message.includes('IMPORT_UPLOAD_EXPIRED')
            ? 'File import đã hết hạn (giữ tối đa 1 giờ). Vui lòng tải lại.'
            : message.includes('IMPORT_UPLOAD_ALREADY_COMMITTED')
              ? 'File import này đã được nhập. Vui lòng tải file mới nếu cần nhập tiếp.'
              : 'Import thất bại. Vui lòng thử lại.',
      });
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="work-editor duty-modern-editor duty-bulk-import" aria-label="Import Excel công tác">
      <div className="work-editor-title">
        <div>
          <span>NHẬP HÀNG LOẠT</span>
          <h3>Import Excel công tác</h3>
        </div>
        <button type="button" className="duty-editor-close" onClick={onClose} aria-label="Đóng import">
          <span aria-hidden="true">×</span> Đóng
        </button>
      </div>

      <p className="duty-bulk-import-help">
        Mỗi dòng là một công tác. File được tải lên server trước, hệ thống đọc lại để kiểm tra.
        Cột <code>dia_diem</code> gõ tự do (tối đa 200 ký tự).
        Một dòng lỗi thì chưa nhập dòng nào. Tổ trưởng/tổ phó chỉ dùng cột email cấp dưới hoặc thành phần khác, không điền mã phòng ban.
      </p>

      <div className="duty-bulk-import-actions">
        <button type="button" className="work-ghost-button" onClick={downloadDutyImportTemplate} disabled={Boolean(busy)}>
          Tải file nhập liệu mẫu
        </button>
        <button type="button" className="work-primary-button" onClick={handlePickFile} disabled={Boolean(busy)}>
          {busy === 'upload' || busy === 'validate' ? 'Đang xử lý…' : 'Import file nhập liệu'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={handleFileChange}
        />
      </div>

      {fileName ? <p className="duty-bulk-import-file">File: {fileName}</p> : null}

      {feedback.text ? (
        <div className={`work-feedback ${feedback.type === 'ok' ? 'success' : feedback.type}`} role="status" aria-live="polite">
          {feedback.text}
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="duty-bulk-import-errors">
          <strong>Báo cáo lỗi ({errors.length})</strong>
          <ul>
            {errors.map((error, index) => (
              <li key={`${error.rowNumber}-${index}`}>
                <span>{error.rowNumber > 0 ? `Dòng ${error.rowNumber}` : 'File'}</span>
                <strong>{error.message}</strong>
                {error.detail ? <small>{error.detail}</small> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview.length > 0 ? (
        <div className="duty-bulk-import-preview">
          <div className="duty-bulk-import-preview-head">
            <strong>Xem trước ({preview.length} công tác)</strong>
            <button type="button" className="work-ghost-button" onClick={resetStage} disabled={Boolean(busy)}>
              Hủy
            </button>
          </div>
          <ul>
            {preview.map((row) => (
              <li key={row.rowNumber}>
                <strong>{row.title}</strong>
                <small>{formatPreviewTime(row)}</small>
                <small>
                  {[
                    row.departmentNames.length ? `PB: ${row.departmentNames.join(', ')}` : '',
                    row.participantEmails.length ? `Email: ${row.participantEmails.join(', ')}` : '',
                    row.otherParticipants ? `Khác: ${row.otherParticipants}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </li>
            ))}
          </ul>
          <button type="button" className="work-primary-button" onClick={handleCommit} disabled={Boolean(busy)}>
            {busy === 'commit' ? 'Đang import…' : `Xác nhận import ${preview.length} công tác`}
          </button>
        </div>
      ) : null}

      {result ? (
        <div className="duty-bulk-import-result">
          <strong>Đã tạo {result.createdCount} công tác</strong>
          <ul>
            {(result.duties || []).map((duty) => (
              <li key={duty.id}>{duty.title}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
