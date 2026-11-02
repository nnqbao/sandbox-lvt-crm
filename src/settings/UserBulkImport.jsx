import { useEffect, useRef, useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { anyApi } from 'convex/server';
import { assertImportFileMeta } from '../lib/userImport.js';
import { downloadActiveUsersWorkbook } from '../lib/userExport.js';
import {
  downloadUserImportErrorPdf,
  downloadUserImportTemplate,
} from '../lib/userImportExcel.js';

/**
 * Bulk user import: upload .xlsx to server first, then server parses/validates/commits
 * from that stored file. File is retained 1 hour whether valid or not.
 */
export default function UserBulkImport({
  onImported = null,
  users = [],
  departments = [],
  positions = [],
  permissionGroups = [],
} = {}) {
  const fileInputRef = useRef(null);
  const generateUploadUrl = useMutation(anyApi.userImport.generateUploadUrl);
  const registerUpload = useMutation(anyApi.userImport.registerUpload);
  const ensureCodes = useMutation(anyApi.permissionGroups.ensureCodes);
  const validateUpload = useAction(anyApi.userImport.validateUpload);
  const commitImport = useAction(anyApi.userImport.commit);

  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [errors, setErrors] = useState([]);
  const [preview, setPreview] = useState([]);
  const [uploadId, setUploadId] = useState(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    void ensureCodes({}).catch(() => {});
  }, [ensureCodes]);

  const handleExportUsers = () => {
    try {
      const exported = downloadActiveUsersWorkbook({
        users,
        departments,
        positions,
        permissionGroups,
      });
      setFeedback({
        type: 'ok',
        text:
          exported.rowCount > 0
            ? `Đã xuất ${exported.rowCount} người dùng active → ${exported.fileName}`
            : `Không có người dùng active để xuất (${exported.fileName}).`,
      });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể xuất danh sách người dùng. Vui lòng thử lại.' });
    }
  };

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
        setBusy(null);
        return;
      }

      // 1) Upload to server first (stable source of truth).
      const uploadUrl = await generateUploadUrl({});
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type':
            file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error('IMPORT_UPLOAD_FAILED');
      }
      const { storageId } = await uploadResponse.json();
      const registered = await registerUpload({
        storageId,
        fileName: file.name,
        fileSize: file.size,
      });

      setUploadId(registered.uploadId);
      setFileName(file.name);

      // 2) Only after upload succeeds: server reads the stored file and validates.
      setBusy('validate');
      const validation = await validateUpload({ uploadId: registered.uploadId });
      if (!validation.ok) {
        setErrors(validation.errors || []);
        setPreview([]);
        setFeedback({
          type: 'error',
          text: `File đã lưu trên server nhưng có ${validation.errors.length} lỗi. Sửa file rồi import lại (file hiện tại tự xóa sau 1 giờ).`,
        });
        setBusy(null);
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
            : 'Không thể tải / kiểm tra file import. Vui lòng thử lại.',
      });
      resetStage();
    } finally {
      setBusy(null);
    }
  };

  const handleCommit = async () => {
    if (!uploadId || !preview.length) return;
    setBusy('commit');
    try {
      // 3) Commit re-reads the same server file — no client rows.
      const committed = await commitImport({ uploadId });
      setResult(committed);
      setPreview([]);
      setFeedback({
        type: 'ok',
        text: `Đã import thành công ${committed.createdCount} tài khoản User. File gốc vẫn giữ trên server đến hết 1 giờ.`,
      });
      onImported?.();
    } catch (error) {
      const message = String(error?.message || error || '');
      setFeedback({
        type: 'error',
        text: message.includes('EMAIL_TAKEN')
          ? 'Phát hiện email trùng khi ghi dữ liệu. Không tạo tài khoản nào (đã hoàn tác nếu có).'
          : message.includes('IMPORT_VALIDATION_FAILED')
            ? 'Dữ liệu trên server không còn hợp lệ. Vui lòng import lại file.'
            : message.includes('IMPORT_UPLOAD_EXPIRED')
              ? 'File import đã hết hạn (giữ tối đa 1 giờ). Vui lòng tải lại.'
              : message.includes('IMPORT_UPLOAD_ALREADY_COMMITTED')
                ? 'File import này đã được nhập. Vui lòng tải file mới nếu cần nhập tiếp.'
                : 'Import thất bại. Vui lòng thử lại.',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="user-bulk-import">
      <div className="form-heading">
        <strong>Import người dùng hàng loạt</strong>
        <button
          type="button"
          className="field-help-trigger"
          aria-label="Thông tin import người dùng hàng loạt"
          title="Chỉ tạo tài khoản vai trò User. File được tải lên server trước, rồi hệ thống đọc lại file đó để kiểm tra và tạo user. File (kể cả khi lỗi) tự xóa sau 1 giờ. Nút xuất chỉ lấy user đang active, không gồm mật khẩu/vai trò."
        >
          !
        </button>
      </div>
      <div className="user-bulk-import-actions">
        <button type="button" className="secondary-button" onClick={downloadUserImportTemplate} disabled={Boolean(busy)}>
          Tải file nhập liệu mẫu
        </button>
        <button type="button" className="primary-button" onClick={handlePickFile} disabled={Boolean(busy)}>
          {busy === 'upload' || busy === 'validate' ? 'Đang xử lý…' : 'Import file nhập liệu'}
        </button>
        <button type="button" className="export-button" onClick={handleExportUsers} disabled={Boolean(busy)}>
          Xuất DS người dùng
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={handleFileChange}
        />
      </div>

      {feedback.text ? (
        <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
          {feedback.text}
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="user-bulk-import-errors">
          <div className="form-heading">
            <strong>Báo cáo lỗi ({errors.length})</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => downloadUserImportErrorPdf(errors, { fileName })}
            >
              Tải PDF báo cáo lỗi
            </button>
          </div>
          <div className="user-table wide-table" aria-label="Lỗi import người dùng">
            <div className="user-table-head user-table-head-3">
              <span>Dòng</span>
              <span>Lỗi</span>
              <span>Chi tiết</span>
            </div>
            {errors.map((error, index) => (
              <div className="user-row user-row-3" key={`${error.rowNumber}-${index}`}>
                <span>{error.rowNumber > 0 ? error.rowNumber : '—'}</span>
                <strong>{error.message}</strong>
                <span>{error.detail || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {preview.length > 0 ? (
        <div className="user-bulk-import-preview">
          <div className="form-heading">
            <strong>Xem trước ({preview.length} tài khoản)</strong>
            <button type="button" className="text-button" onClick={resetStage} disabled={Boolean(busy)}>
              Hủy
            </button>
          </div>
          <div className="user-table wide-table" aria-label="Xem trước import người dùng">
            <div className="user-table-head user-table-head-5">
              <span>Dòng</span>
              <span>Họ tên / Email</span>
              <span>Tổ CM / Chức vụ</span>
              <span>Nhóm quyền</span>
              <span>Vai trò</span>
            </div>
            {preview.map((row) => (
              <div className="user-row user-row-5" key={row.rowNumber}>
                <span>{row.rowNumber}</span>
                <div>
                  <strong>{row.name}</strong>
                  <span>{row.email}</span>
                </div>
                <div className="meta-stack">
                  <span>
                    {row.departmentName} ({row.departmentCode})
                  </span>
                  <span>
                    {row.positionName} ({row.positionCode})
                  </span>
                </div>
                <span>
                  {row.permissionGroupName} ({row.permissionGroupCode})
                </span>
                <span className="role-tag">User</span>
              </div>
            ))}
          </div>
          <button type="button" className="primary-button" onClick={handleCommit} disabled={Boolean(busy)}>
            {busy === 'commit' ? 'Đang import…' : `Xác nhận import ${preview.length} tài khoản`}
          </button>
        </div>
      ) : null}

      {result ? (
        <div className="user-bulk-import-result">
          <div className="form-heading">
            <strong>Kết quả import ({result.createdCount})</strong>
          </div>
          <div className="user-table wide-table" aria-label="Kết quả import người dùng">
            <div className="user-table-head user-table-head-2">
              <span>Họ tên</span>
              <span>Email</span>
            </div>
            {result.users.map((user) => (
              <div className="user-row user-row-2" key={user.email}>
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
