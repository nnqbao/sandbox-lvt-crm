import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useNotificationFocus, WORK_NOTIFICATION_FOCUS_TYPES } from '../notifications/useNotificationFocus';
import WorkAssignmentRows from './WorkAssignmentRows';
import WorkCreatePreview from './WorkCreatePreview';
import { EditActionConfirm } from '../lib/ConfirmActionModal';
import { messageFor } from '../lib/appErrorMessage';
import { DutyListHeading } from '../duties/DutyListFilters';
import { WorkListEmpty, WorkListSearch, WorkListTabs } from './WorkListFilters';
import WorkListSummary from './WorkListSummary';
import { PencilIcon, TrashIcon, WorkExpandHint, WorkIconButton } from './WorkCardIcons';
import WorkTaskChatModal, { WorkChatButton } from './WorkTaskChatModal';
import { WorkApprovalProgress, WorkApproverPicker, WorkDocumentDecisionModal } from './WorkApprovalParts';
import { useNotificationChatModal } from '../lib/chatAutoOpen';
import {
  assignmentsFromDocument,
  emptyWorkSearch,
  filterWorksBySearch,
  filterWorksByTab,
  findWorkChatFocusItem,
  formatWorkDate,
  formatWorkDateTime,
  workListTabCounts,
  workListTabOf,
  workReminderSourceType,
  workTabAllowsPersonalReminder,
  WORK_LIST_TAB_TODO,
  WORK_COMPLETION_NOTE_MAX_LENGTH,
  isWorkDocumentUnreleased,
  workAssignmentDisplayStatus,
  workAssignmentPayload,
  workCreatorLabel,
  workEditFormRequiresApproval,
  workFormRequiresApproval,
  workLastEditedLabel,
  WORK_HAS_SUBMISSIONS_NOTE,
  WORK_REAPPROVAL_WARNING,
} from './workDisplay';
import {
  canPreviewWorkFile,
  spreadsheetPreviewFromArrayBuffer,
  syncWorkFilePreviewSplitClass,
  workFilePreviewKind,
  WORK_FILE_PREVIEW_OPEN_EVENT,
  WORK_FILE_PREVIEW_SPLIT_MEDIA,
} from './workFilePreview';
import { filterByPickerSearch, personPickerHaystack } from '../lib/pickerSearch';
import PersonalReminderPanel, {
  PersonalReminderLayout,
  reminderMapFromList,
} from '../notifications/PersonalReminderPanel';
import { PersonalReminderQueryBoundary } from '../notifications/personalReminderQuery';
import './work.css';

const ACCEPTED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'xls', 'png', 'jpg', 'jpeg'];

function workUploadErrorMessage(code) {
  if (code === 'UPLOAD_REGISTRATION_FAILED') {
    return 'Hệ thống chưa thể lưu tệp công văn. Vui lòng thử lại; nếu vẫn lỗi, liên hệ quản trị viên và cung cấp thời điểm xảy ra lỗi.';
  }
  if (code === 'FILE_TEMPORARILY_UNAVAILABLE') {
    return 'Kho lưu trữ tệp tạm thời chưa phản hồi. Vui lòng thử lại sau ít phút.';
  }
  if (code === 'FILE_ACCESS_DENIED') {
    return 'Bạn không có quyền tải tệp công văn lên.';
  }
  return 'Không thể tải tệp công văn lên. Vui lòng thử lại.';
}

function fileSizeLabel(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function settleWorkUploadedFile(fetchAccessToken, cleanupToken, committed) {
  const token = await fetchAccessToken({ forceRefreshToken: false });
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`/api/files/uploads/${encodeURIComponent(cleanupToken)}`, {
    method: committed ? 'POST' : 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || `WORK_UPLOAD_SETTLEMENT_FAILED:${response.status}`);
  }
}

async function settleWorkCleanupJob(fetchAccessToken, cleanupJobId) {
  if (!cleanupJobId) return;
  const token = await fetchAccessToken({ forceRefreshToken: false });
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`/api/files/cleanup-jobs/work/${encodeURIComponent(cleanupJobId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || `WORK_CLEANUP_FAILED:${response.status}`);
  }
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.4 12s3.5-6 9.6-6 9.6 6 9.6 6-3.5 6-9.6 6-9.6-6-9.6-6Z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M5 20h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

let nextWorkFilePreviewId = 0;

function PrivateFileLink({
  documentId,
  fileName,
  fileUrl,
  privateFile,
  className = '',
  children,
}) {
  const { fetchAccessToken } = useConvexAuth();
  const [busyAction, setBusyAction] = useState('');
  const [preview, setPreview] = useState(null);
  const [splitPreview, setSplitPreview] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(WORK_FILE_PREVIEW_SPLIT_MEDIA).matches
  ));
  const closeButtonRef = useRef(null);
  const previewIdRef = useRef(`work-file-preview-${++nextWorkFilePreviewId}`);
  const kind = workFilePreviewKind(fileName);
  const canPreview = canPreviewWorkFile(fileName);
  const previewUrl = preview?.url || '';
  const previewOpen = Boolean(preview);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!previewOpen) return undefined;
    const previewId = previewIdRef.current;
    const media = window.matchMedia(WORK_FILE_PREVIEW_SPLIT_MEDIA);
    const syncSplit = () => {
      const nextSplit = media.matches;
      setSplitPreview(nextSplit);
      syncWorkFilePreviewSplitClass(previewId, nextSplit);
    };
    const closeFromEscape = (event) => {
      if (event.key === 'Escape') {
        setPreview((current) => {
          if (current?.url) URL.revokeObjectURL(current.url);
          return null;
        });
      }
    };
    const closeIfOtherPreview = (event) => {
      if (event.detail === previewId) return;
      setPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return null;
      });
    };
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    syncSplit();
    media.addEventListener('change', syncSplit);
    window.addEventListener(WORK_FILE_PREVIEW_OPEN_EVENT, closeIfOtherPreview);
    window.dispatchEvent(new CustomEvent(WORK_FILE_PREVIEW_OPEN_EVENT, { detail: previewId }));
    window.addEventListener('keydown', closeFromEscape);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      syncWorkFilePreviewSplitClass(previewId, false);
      setSplitPreview(false);
      window.document.body.style.overflow = previousOverflow;
      media.removeEventListener('change', syncSplit);
      window.removeEventListener(WORK_FILE_PREVIEW_OPEN_EVENT, closeIfOtherPreview);
      window.removeEventListener('keydown', closeFromEscape);
    };
  }, [previewOpen]);

  if (!documentId || !privateFile) return null;

  const fetchFileBlob = async () => {
    const headers = new Headers();
    const token = await fetchAccessToken({ forceRefreshToken: false });
    if (!token) throw new Error('AUTH_REQUIRED');
    headers.set('Authorization', 'Bearer ' + token);
    const basePath = `/api/files/${encodeURIComponent(documentId)}`;
    const metadataResponse = await fetch(`${basePath}/metadata`, { headers, cache: 'no-store' });
    if (!metadataResponse.ok) {
      if ('caches' in window) {
        const cache = await window.caches.open('lvt-work-files-v1');
        for (const request of await cache.keys()) {
          if (new URL(request.url).pathname === basePath) await cache.delete(request);
        }
      }
      throw new Error(`FILE_METADATA_FAILED:${metadataResponse.status}`);
    }
    const metadata = await metadataResponse.json();
    const versionedURL = `${basePath}?v=${encodeURIComponent(metadata.fileVersion)}`;
    if ('caches' in window) {
      const cache = await window.caches.open('lvt-work-files-v1');
      const cached = await cache.match(versionedURL);
      if (cached) return cached.blob();
      const response = await fetch(basePath, { headers });
      if (!response.ok) throw new Error(`FILE_DOWNLOAD_FAILED:${response.status}`);
      await cache.put(versionedURL, response.clone());
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname === basePath && request.url !== new URL(versionedURL, window.location.origin).href) {
          await cache.delete(request);
        }
      }
      return response.blob();
    }
    const response = await fetch(basePath, { headers });
    if (!response.ok) throw new Error(`FILE_DOWNLOAD_FAILED:${response.status}`);
    return response.blob();
  };

  const runFileAction = async (action) => {
    if (busyAction) return;
    setBusyAction(action);
    try {
      const blob = await fetchFileBlob();
      const objectUrl = URL.createObjectURL(blob);
      if (action === 'preview') {
        let nextPreview = { kind, url: objectUrl };
        if (kind === 'spreadsheet') {
          nextPreview = {
            ...nextPreview,
            sheets: spreadsheetPreviewFromArrayBuffer(await blob.arrayBuffer()),
            sheetIndex: 0,
          };
        } else if (kind === 'docx') {
          nextPreview = { ...nextPreview, buffer: await blob.arrayBuffer() };
        }
        const nextSplit = window.matchMedia(WORK_FILE_PREVIEW_SPLIT_MEDIA).matches;
        setSplitPreview(nextSplit);
        syncWorkFilePreviewSplitClass(previewIdRef.current, nextSplit);
        setPreview((current) => {
          if (current?.url) URL.revokeObjectURL(current.url);
          return nextPreview;
        });
      } else {
        const anchor = window.document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName || 'cong-van';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    } catch (error) {
      console.error('Document file action failed', error);
      window.alert('Không thể mở tệp công văn. Vui lòng đăng nhập lại hoặc liên hệ quản trị viên.');
    } finally {
      setBusyAction('');
    }
  };

  const closePreview = () => {
    setPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  return (
    <>
      <span className={`${className} work-file-actions`.trim()}>
        <span className="work-file-name">{children}</span>
        {canPreview ? (
          <button
            type="button"
            className="work-file-icon-button"
            onClick={() => void runFileAction('preview')}
            disabled={Boolean(busyAction)}
            aria-label={`Xem trước ${fileName}`}
            title="Xem trước"
          >
            <EyeIcon />
          </button>
        ) : null}
        <button
          type="button"
          className="work-file-icon-button"
          onClick={() => void runFileAction('download')}
          disabled={Boolean(busyAction)}
          aria-label={`Tải xuống ${fileName}`}
          title="Tải xuống"
        >
          <DownloadIcon />
        </button>
        {busyAction ? <span className="work-file-busy" role="status">Đang tải…</span> : null}
      </span>
      {preview ? createPortal((
        <div className="work-file-preview-backdrop" role="presentation" onMouseDown={(event) => {
          if (splitPreview) return;
          if (event.target === event.currentTarget) closePreview();
        }}>
          <section
            className="work-file-preview-dialog"
            role="dialog"
            aria-modal={splitPreview ? 'false' : 'true'}
            aria-label={`Xem trước ${fileName}`}
          >
            <header>
              <strong>{fileName}</strong>
              <div>
                <button type="button" className="work-file-preview-action" onClick={() => void runFileAction('download')}>
                  <DownloadIcon />
                  <span>Tải xuống</span>
                </button>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className="work-file-preview-close"
                  onClick={closePreview}
                  aria-label="Đóng xem trước"
                >
                  <CloseIcon />
                </button>
              </div>
            </header>
            <div className={`work-file-preview-content${preview.kind === 'docx' || preview.kind === 'spreadsheet' ? ' is-office' : ''}`}>
              {preview.kind === 'pdf' ? (
                <iframe src={preview.url} title={`Nội dung ${fileName}`} />
              ) : null}
              {preview.kind === 'image' ? (
                <img src={preview.url} alt={`Xem trước ${fileName}`} />
              ) : null}
              {preview.kind === 'docx' ? (
                <DocxPreviewBody buffer={preview.buffer} fileName={fileName} />
              ) : null}
              {preview.kind === 'spreadsheet' ? (
                <SpreadsheetPreviewBody
                  sheets={preview.sheets || []}
                  sheetIndex={preview.sheetIndex || 0}
                  onSheetChange={(sheetIndex) => setPreview((current) => (
                    current ? { ...current, sheetIndex } : current
                  ))}
                />
              ) : null}
            </div>
          </section>
        </div>
      ), window.document.body) : null}
    </>
  );
}

function DocxPreviewBody({ buffer, fileName }) {
  const containerRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!buffer || !containerRef.current) return undefined;
    let cancelled = false;
    const container = containerRef.current;
    container.replaceChildren();
    (async () => {
      try {
        const { renderAsync } = await import('docx-preview');
        if (cancelled) return;
        await renderAsync(buffer, container, undefined, {
          inWrapper: true,
          ignoreWidth: true,
          ignoreHeight: true,
          breakPages: true,
        });
      } catch (error) {
        console.error('DOCX preview failed', error);
        if (!cancelled) setError('Không xem trước được tệp Word này. Hãy tải xuống để mở bằng Microsoft Word.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buffer]);

  return (
    <div className="work-office-preview">
      <p className="work-office-preview-note">
        Bản xem trước trên trình duyệt, có thể khác Microsoft Word. Tải xuống để xem bản gốc.
      </p>
      {error ? <p className="work-office-preview-error">{error}</p> : null}
      <div ref={containerRef} className="work-docx-preview" aria-label={`Nội dung ${fileName}`} />
    </div>
  );
}

function SpreadsheetPreviewBody({ sheets, sheetIndex, onSheetChange }) {
  const active = sheets[sheetIndex] || sheets[0];
  if (!active) {
    return <p className="work-office-preview-error">Không đọc được nội dung Excel.</p>;
  }
  const columnCount = active.rows.reduce((max, row) => Math.max(max, row.length), 0);
  return (
    <div className="work-office-preview">
      <p className="work-office-preview-note">
        Bản xem trước trên trình duyệt, có thể khác Microsoft Excel. Tải xuống để xem bản gốc.
        {active.truncated ? ' Chỉ hiện một phần trang tính để máy không bị chậm.' : ''}
      </p>
      {sheets.length > 1 ? (
        <div className="work-sheet-tabs" role="tablist" aria-label="Trang tính">
          {sheets.map((sheet, index) => (
            <button
              key={`${sheet.name}-${index}`}
              type="button"
              role="tab"
              aria-selected={index === sheetIndex}
              className={`work-sheet-tab${index === sheetIndex ? ' is-active' : ''}`}
              onClick={() => onSheetChange(index)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="work-sheet-scroll">
        <table className="work-sheet-table">
          <tbody>
            {active.rows.length === 0 ? (
              <tr>
                <td>Trang tính trống.</td>
              </tr>
            ) : active.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columnCount }, (_, columnIndex) => (
                  <td key={columnIndex}>{row[columnIndex] || ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function workStatusLabel(status) {
  return {
    pending: 'Chờ duyệt',
    approved: 'Đã duyệt',
    rejected: 'Bị trả lại',
    awaiting_approval: 'Chờ duyệt',
    approval_returned: 'Bị trả lại',
    unassigned: 'Chưa giao việc',
    unreleased: 'Chờ duyệt (chưa giao)',
    in_progress: 'Đang thực hiện',
    completed: 'Đã hoàn thành',
    completed_late: 'Hoàn thành trễ',
    pending_completion: 'Chờ duyệt hoàn thành',
    rejected_completion: 'Bị từ chối hoàn thành',
    not_completed: 'Chưa hoàn thành',
    overdue: 'Quá hạn',
    pending_task: 'Chưa hoàn thành',
  }[status] || 'Chưa cập nhật';
}

function WorkStatus({ status }) {
  return <span className={`work-status ${status || 'pending'}`}>{workStatusLabel(status)}</span>;
}

function WorkFileDropzone({ file, onFile, label = 'Kéo thả công văn vào đây' }) {
  const [dragging, setDragging] = useState(false);
  const handleFile = (candidate) => {
    if (!candidate) return;
    const extension = candidate.name.toLowerCase().split('.').pop();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      onFile(null, 'Chỉ chấp nhận PDF, DOCX, Excel, PNG hoặc JPG.');
      return;
    }
    if (candidate.size > 20 * 1024 * 1024) {
      onFile(null, 'Dung lượng tệp tối đa là 20MB.');
      return;
    }
    onFile(candidate, '');
  };
  return (
    <label
      className={`work-file-dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFile(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        type="file"
        accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      <span className="work-file-orbit">↥</span>
      {file ? (
        <>
          <strong>{file.name}</strong>
          <small>{fileSizeLabel(file.size)} · Nhấn để đổi tệp</small>
        </>
      ) : (
        <>
          <strong>{label}</strong>
          <small>hoặc bấm để chọn · PDF, DOCX, Excel, PNG, JPG · tối đa 20MB</small>
        </>
      )}
    </label>
  );
}

function DepartmentProgress({ status, taskCount }) {
  return (
    <div className="work-progress">
      <div className="work-progress-head">
        <span>Tiến độ phòng ban</span>
        <WorkStatus status={status} />
      </div>
      <div className="work-progress-track">
        <span className={status === 'completed' ? 'is-complete' : ''} />
      </div>
      <small>
        {status === 'unassigned'
          ? 'Chưa có đầu mục cá nhân nào được giao.'
          : `${taskCount || 0} đầu mục cá nhân đang theo dõi.`}
      </small>
    </div>
  );
}

function SubmitterNote({ note, label = 'Nội dung từ người nộp' }) {
  if (!note) return null;
  return (
    <div className="work-submitter-note" role="note">
      <strong>{label}</strong>
      <p>{note}</p>
    </div>
  );
}

function DocumentTypeField({ types, value, onChange, id = 'document-type', error = '' }) {
  const errorId = `${id}-error`;
  return (
    <label className="duty-field work-document-type-field" htmlFor={id}>
      <span className="duty-field-label">Loại văn bản</span>
      <select
        id={id}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      >
        <option value="">Chọn loại văn bản</option>
        {(types || []).map((item) => (
          <option key={item._id} value={item._id}>{item.name}</option>
        ))}
      </select>
      {error ? <span id={errorId} className="work-field-error" role="alert">{error}</span> : null}
    </label>
  );
}

function CompletionSubmitModal({ title, onClose, onSubmit, saving, documentTypes = [], requireDocumentType = false }) {
  const { fetchAccessToken } = useConvexAuth();
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [documentTypeError, setDocumentTypeError] = useState('');
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    if (!file) {
      setError('Vui lòng đính kèm file bằng chứng hoàn thành.');
      return;
    }
    if (requireDocumentType && !documentTypeId) {
      setError('');
      setDocumentTypeError('Vui lòng chọn loại văn bản.');
      return;
    }
    setDocumentTypeError('');
    setError('');
    try {
      const token = await fetchAccessToken({ forceRefreshToken: false });
      if (!token) throw new Error('AUTH_REQUIRED');
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      });
      const uploaded = await response.json().catch(() => null);
      if (!response.ok || !uploaded?.driveFileId || !uploaded?.cleanupToken) {
        throw new Error(uploaded?.error || `WORK_UPLOAD_FAILED:${response.status}`);
      }
      await onSubmit({
        note: note.trim(),
        documentTypeId,
        uploaded: {
          driveFileId: uploaded.driveFileId,
          driveChecksum: uploaded.driveChecksum,
          cleanupToken: uploaded.cleanupToken,
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
        },
      });
    } catch (submitError) {
      setError('Không thể tải bằng chứng lên. Vui lòng thử lại.');
      console.error(submitError);
    }
  };
  return (
    <div className="work-modal-backdrop" role="presentation">
      <form className="work-modal" onSubmit={submit} noValidate>
        <button type="button" className="work-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="work-kicker">Nộp công việc</span>
        <h3>{title}</h3>
        <p className="work-modal-context">Đính kèm file bằng chứng hoàn thành rồi bấm Nộp. Có thể gửi thêm nội dung cho người giao. Người tạo việc sẽ đánh dấu hoàn thành.</p>
        <WorkFileDropzone
          file={file}
          label="Kéo thả tài liệu/hình vào đây"
          onFile={(nextFile, fileError) => {
            setFile(nextFile);
            if (!nextFile) {
              setDocumentTypeId('');
              setDocumentTypeError('');
            }
            if (fileError) setError(fileError);
          }}
        />
        {file && requireDocumentType ? (
          <DocumentTypeField
            id="completion-document-type"
            types={documentTypes}
            value={documentTypeId}
            onChange={(next) => {
              setDocumentTypeId(next);
              if (next) setDocumentTypeError('');
            }}
            error={documentTypeError}
          />
        ) : null}
        <label className="work-field-label" htmlFor="completion-note">Nội dung gửi người giao (không bắt buộc)</label>
        <textarea
          id="completion-note"
          rows={4}
          maxLength={WORK_COMPLETION_NOTE_MAX_LENGTH}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Nhập nội dung phản hồi cho người giao việc…"
        />
        <small>{note.trim().length}/{WORK_COMPLETION_NOTE_MAX_LENGTH}</small>
        {error ? <div className="work-feedback error">{error}</div> : null}
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="work-primary-button" disabled={saving}>
            {saving ? 'Đang nộp…' : 'Nộp'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CompletionReviewModal({ item, onClose, onSubmit, saving }) {
  const [qualityPercent, setQualityPercent] = useState('100');
  const [rejectionReason, setRejectionReason] = useState('');
  const [mode, setMode] = useState('approve');
  const [error, setError] = useState('');
  const submit = (event) => {
    event.preventDefault();
    if (mode === 'approve') {
      const value = Number(qualityPercent);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        setError('Phần trăm hoàn thành phải từ 0 đến 100.');
        return;
      }
      if (value < 50 && !window.confirm('% quá thấp, bạn có chắc duyệt công việc này không?')) {
        return;
      }
      onSubmit({ decision: 'approve', qualityPercent: Math.round(value) });
      return;
    }
    if (!rejectionReason.trim()) {
      setError('Vui lòng nhập lý do chưa duyệt.');
      return;
    }
    onSubmit({ decision: 'reject', rejectionReason: rejectionReason.trim() });
  };
  return (
    <div className="work-modal-backdrop" role="presentation">
      <form className="work-modal" onSubmit={submit}>
        <button type="button" className="work-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="work-kicker">Duyệt hoàn thành</span>
        <h3>{item.content}</h3>
        <p className="work-modal-context">
          {item.userName} · {item.departmentName} · Hạn {formatWorkDate(item.deadline)}
          {item.submittedLate ? ' · Nộp trễ' : ''}
        </p>
        <SubmitterNote note={item.note} />
        <div className="work-assignment-actions">
          <button type="button" className={`work-outline-button ${mode === 'approve' ? 'is-active' : ''}`} onClick={() => setMode('approve')}>Duyệt</button>
          <button type="button" className={`work-outline-button ${mode === 'reject' ? 'is-active' : ''}`} onClick={() => setMode('reject')}>Chưa duyệt</button>
        </div>
        {mode === 'approve' ? (
          <>
            <label className="work-field-label" htmlFor="review-quality">Mức độ hoàn thành (%) — bắt buộc</label>
            <input
              id="review-quality"
              type="number"
              min="0"
              max="100"
              step="1"
              value={qualityPercent}
              onChange={(event) => setQualityPercent(event.target.value)}
              required
            />
          </>
        ) : (
          <>
            <label className="work-field-label" htmlFor="review-reason">Lý do chưa duyệt</label>
            <textarea
              id="review-reason"
              rows={4}
              maxLength={500}
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="Nêu rõ phần cần bổ sung/sửa…"
              required
            />
          </>
        )}
        {error ? <div className="work-feedback error">{error}</div> : null}
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className={mode === 'approve' ? 'work-primary-button' : 'work-reject-button'} disabled={saving}>
            {saving ? 'Đang lưu…' : mode === 'approve' ? 'Duyệt hoàn thành' : 'Trả về user'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function WorkManagement({ allowCreate = true, hideCompletionQueue = false, focusTarget = null }) {
  const options = useQuery(anyApi.work.formOptions, allowCreate ? {} : 'skip');
  const listData = useQuery(anyApi.work.listAdmin);
  const createDocument = useMutation(anyApi.work.createDocument);
  const updateDocument = useMutation(anyApi.work.updateDocument);
  const deleteDocument = useMutation(anyApi.work.deleteDocument);
  const ensureDocumentTypes = useMutation(anyApi.documentTypes.ensureDefaults);
  const { fetchAccessToken } = useConvexAuth();
  const reviewWorkCompletion = useMutation(anyApi.work.reviewWorkCompletion);
  const reviewPersonalCompletion = useMutation(anyApi.work.reviewPersonalCompletion);
  const [open, setOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [file, setFile] = useState(null);
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [title, setTitle] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editConfirm, setEditConfirm] = useState(null);
  const [listTab, setListTab] = useState(WORK_LIST_TAB_TODO);
  const [listSearch, setListSearch] = useState(emptyWorkSearch);
  const [expanded, setExpanded] = useState(null);
  const [approverIds, setApproverIds] = useState([]);
  const [approverError, setApproverError] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  const [pendingSettlement, setPendingSettlement] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);

  useNotificationFocus(focusTarget, {
    acceptSourceTypes: WORK_NOTIFICATION_FOCUS_TYPES,
  });

  const documents = listData?.documents || [];
  const pendingCompletionReviews = listData?.pendingCompletionReviews || [];
  // Creator-based rule (server enforces): admin/mod documents go to Ban giám hiệu
  // first, unless the only assignee is the creator (self-only work is released now).
  // An admin edit of an approved/released document goes back to Ban giám hiệu
  // unless the admin is the only assignee (`editRequiresReapproval`).
  const formRequiresApproval = editingDocument
    ? workEditFormRequiresApproval({ document: editingDocument, assignments, editorId: options?.selfUserId })
    : workFormRequiresApproval({
        followsApprovalFlow: options?.requiresApproval,
        assignments,
        creatorId: options?.selfUserId,
      });
  // Only admin/mod pick approvers. A non-ops creator editing a document an admin
  // sent back to approval keeps its current approvers (the server falls back to them).
  const canPickApprovers = options?.isOps !== false;
  const needsApproverPick = formRequiresApproval && canPickApprovers;
  const showReapprovalWarning = Boolean(editingDocument?.editRequiresReapproval) && formRequiresApproval;
  // Admin/mod of other departments (`editOnly`) are selectable only while an admin edits.
  const assignableUsers = (options?.users || []).filter((user) => editingDocument || !user.editOnly);

  useEffect(() => {
    if (focusTarget?.sourceType !== 'work_chat' || !focusTarget?.sourceId) return;
    const match = findWorkChatFocusItem({ documents }, focusTarget.sourceId);
    if (!match) return;
    setListTab(workListTabOf(match.item));
    setListSearch(emptyWorkSearch());
    setExpanded(match.expandId);
  }, [focusTarget?.token, focusTarget?.sourceId, focusTarget?.sourceType, documents]);

  const visibleDocuments = useMemo(() => filterWorksByTab(documents, listTab), [documents, listTab]);
  const createdTabCounts = useMemo(() => workListTabCounts(documents), [documents]);
  const filteredDocuments = useMemo(
    () => filterWorksBySearch(visibleDocuments, listSearch),
    [visibleDocuments, listSearch],
  );

  useEffect(() => {
    void ensureDocumentTypes({}).catch(() => {});
  }, [ensureDocumentTypes]);

  const reset = () => {
    setEditingDocument(null);
    setFile(null);
    setDocumentTypeId('');
    setTitle('');
    setAssignments([]);
    setApproverIds([]);
    setApproverError('');
    setPreviewOpen(false);
  };

  const closeEditor = () => {
    reset();
    setEditConfirm(null);
    setOpen(false);
  };

  const startEdit = (document) => {
    setEditingDocument(document);
    setFile(null);
    setDocumentTypeId(document.documentTypeId || '');
    setTitle(document.title || document.fileName || '');
    // Keep only approvers still eligible (active Ban giám hiệu); the server re-validates.
    const eligibleApproverIds = new Set((options?.approvers || []).map((person) => String(person._id)));
    setApproverIds(
      (document.approvers || [])
        .map((person) => String(person._id))
        .filter((id) => eligibleApproverIds.has(id)),
    );
    setApproverError('');
    setAssignments(assignmentsFromDocument(document));
    setPreviewOpen(false);
    setFeedback({ type: '', text: '' });
    setOpen(true);
    window.requestAnimationFrame(() => {
      window.document.getElementById('work-document-editor')?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  useEffect(() => {
    if (!editingDocument?.privateFile || documentTypeId) return;
    const types = options?.documentTypes || listData?.documentTypes || [];
    const fallback = types.find((item) => item.code === 'BIEN_BAN');
    if (fallback?._id) setDocumentTypeId(fallback._id);
  }, [documentTypeId, editingDocument, listData?.documentTypes, options?.documentTypes]);

  /**
   * Client-side checks run before any confirmation/preview (the server re-checks).
   * A missing approver shows only the picker's field error, not a second banner.
   */
  const validateWorkForm = () => {
    if (!title.trim()) {
      setFeedback({ type: 'error', text: 'Vui lòng nhập tên công việc.' });
      return false;
    }
    if (!assignments.length) {
      setFeedback({ type: 'error', text: 'Vui lòng thêm ít nhất một phân công.' });
      return false;
    }
    if (file && !documentTypeId) {
      setFeedback({ type: 'error', text: 'Vui lòng chọn loại văn bản.' });
      return false;
    }
    if (needsApproverPick && !approverIds.length) {
      setFeedback({ type: '', text: '' });
      setApproverError('Vui lòng chọn ít nhất một người duyệt.');
      return false;
    }
    return true;
  };

  const persistWork = async () => {
    if (saving) return;
    setFeedback({ type: '', text: '' });
    if (pendingSettlement) {
      setSaving(true);
      try {
        await settleWorkUploadedFile(fetchAccessToken, pendingSettlement.cleanupToken, true);
        await settleWorkCleanupJob(fetchAccessToken, pendingSettlement.cleanupJobId).catch((cleanupError) => {
          console.error('Work old file cleanup deferred', cleanupError);
        });
        setPendingSettlement(null);
        setFeedback({ type: 'success', text: 'Đã tạo công việc.' });
        closeEditor();
      } catch (settlementError) {
        console.error('Work upload settlement retry failed', settlementError);
        setFeedback({
          type: 'error',
          text: 'Công văn đã được tạo và tệp vẫn được giữ an toàn, nhưng chưa thể hoàn tất upload. Vui lòng thử lại.',
        });
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!validateWorkForm()) return;
    setSaving(true);
    let stage = file ? 'upload' : 'save';
    let uploaded = null;
    let saved = null;
    let crmCommitted = false;
    try {
      if (file) {
        const token = await fetchAccessToken({ forceRefreshToken: false });
        if (!token) throw new Error('AUTH_REQUIRED');
        const response = await fetch('/api/files/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name),
          },
          body: file,
        });
        uploaded = await response.json().catch(() => null);
        if (!response.ok || !uploaded?.driveFileId || !uploaded?.cleanupToken) {
          throw new Error(uploaded?.error || `WORK_UPLOAD_FAILED:${response.status}`);
        }
      }
      stage = 'save';
      const workflow = {
        title: title.trim(),
        assignments: workAssignmentPayload(assignments),
        ...(documentTypeId ? { documentTypeId } : {}),
        ...(needsApproverPick ? { approverUserIds: approverIds } : {}),
      };
      const fileArgs = uploaded ? {
        driveFileId: uploaded.driveFileId,
        driveChecksum: uploaded.driveChecksum,
        cleanupToken: uploaded.cleanupToken,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      } : editingDocument ? {} : {
        fileName: '',
        fileType: '',
        fileSize: 0,
      };
      saved = editingDocument
        ? await updateDocument({ documentId: editingDocument._id, ...workflow, ...fileArgs })
        : await createDocument({ ...workflow, ...fileArgs });
      crmCommitted = true;
      if (uploaded) {
        stage = 'settlement';
        await settleWorkUploadedFile(fetchAccessToken, uploaded.cleanupToken, true);
      }
      await settleWorkCleanupJob(fetchAccessToken, saved?.cleanupJobId).catch((cleanupError) => {
        console.error('Work old file cleanup deferred', cleanupError);
      });
      setFeedback({
        type: 'success',
        text: formRequiresApproval
          ? (editingDocument
              ? 'Đã lưu và gửi Ban giám hiệu duyệt lại.'
              : 'Đã gửi công việc cho Ban giám hiệu duyệt. Người nhận sẽ thấy sau khi được duyệt.')
          : (editingDocument ? 'Đã cập nhật công việc.' : 'Đã tạo công việc.'),
      });
      closeEditor();
    } catch (error) {
      if (crmCommitted) {
        setPendingSettlement({ ...uploaded, cleanupJobId: saved?.cleanupJobId });
        setFeedback({
          type: 'error',
          text: 'Công văn đã được tạo và tệp vẫn được giữ an toàn, nhưng chưa thể hoàn tất upload. Vui lòng thử lại.',
        });
      } else if (uploaded?.cleanupToken) {
        try {
          await settleWorkUploadedFile(fetchAccessToken, uploaded.cleanupToken, false);
        } catch (cleanupError) {
          console.error('Work orphan upload cleanup failed', cleanupError);
        }
        setFeedback({
          type: 'error',
          text: 'Tệp đã tải lên nhưng không thể lưu công văn. Vui lòng kiểm tra thông tin phân công và người duyệt.',
        });
      } else {
        setFeedback({
          type: 'error',
          text: /WORK_|INVALID_|MODERATOR_|ASSIGNMENT_/.test(String(error?.message || ''))
            ? messageFor(error)
            : workUploadErrorMessage(error?.message),
        });
      }
      console.error('Work document submission failed', {
        stage,
        message: String(error?.message || error),
      });
    } finally {
      setSaving(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (pendingSettlement) {
      void persistWork();
      return;
    }
    // Validate first so a missing field never hides behind the save confirmation.
    if (!validateWorkForm()) return;
    if (editingDocument) {
      setEditConfirm('save');
      return;
    }
    setPreviewOpen(true);
  };

  if ((allowCreate && options === undefined) || listData === undefined) {
    return <div className="work-loading">Đang chuẩn bị sổ công việc…</div>;
  }

  const removeDocument = async (document) => {
    if (!window.confirm(`Xóa công việc ${document.title || document.fileName}?`)) return;
    setSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      const result = await deleteDocument({ documentId: document._id });
      await settleWorkCleanupJob(fetchAccessToken, result?.cleanupJobId).catch((cleanupError) => {
        console.error('Work deleted file cleanup deferred', cleanupError);
      });
      if (editingDocument?._id === document._id) reset();
      setFeedback({ type: 'success', text: 'Đã xóa công việc.' });
    } catch (error) {
      setFeedback({
        type: 'error',
        text: /WORK_DOCUMENT_IMMUTABLE|WORK_HAS_SUBMISSIONS/.test(String(error?.message || ''))
          ? messageFor(error)
          : 'Không thể xóa công việc lúc này.',
      });
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async ({ decision, qualityPercent, rejectionReason }) => {
    if (!reviewing) return;
    setReviewSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      if (reviewing.kind === 'personal_task') {
        await reviewPersonalCompletion({
          taskId: reviewing.taskId,
          userId: reviewing.userId,
          decision,
          qualityPercent,
          rejectionReason,
        });
      } else {
        await reviewWorkCompletion({
          workItemId: reviewing.workItemId,
          userId: reviewing.userId,
          decision,
          qualityPercent,
          rejectionReason,
        });
      }
      setReviewing(null);
      setFeedback({
        type: 'success',
        text: decision === 'approve' ? 'Đã duyệt hoàn thành task.' : 'Đã từ chối và trả task về cho user.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể duyệt hoàn thành lúc này.' });
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <section className="work-management duty-workspace">
      {feedback.text && !open ? <div className={`work-feedback ${feedback.type}`}>{feedback.text}</div> : null}

      {allowCreate && open ? (
        <form id="work-document-editor" className="work-editor duty-modern-editor" onSubmit={submit}>
          <div className="work-editor-title">
            <div>
              <span>{editingDocument ? 'CẬP NHẬT VIỆC' : 'VIỆC MỚI'}</span>
              <h3>{editingDocument ? 'Sửa công việc' : 'Tạo công việc'}</h3>
            </div>
            <button type="button" className="duty-editor-close" onClick={closeEditor} aria-label="Đóng biểu mẫu">
              <span aria-hidden="true">×</span> Đóng
            </button>
          </div>
          <label className="duty-content-field">
            Tên công việc
            <input
              required
              type="text"
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Nhập tên công việc"
            />
            <small>{title.length}/200</small>
          </label>
          <div className="duty-field">
            <span className="duty-field-label">Tệp đính kèm (không bắt buộc)</span>
            {editingDocument && !file && editingDocument.fileName ? (
              <p className="work-muted">Đang giữ tệp hiện tại: {editingDocument.fileName}. Chọn tệp mới nếu muốn thay.</p>
            ) : null}
            <WorkFileDropzone
              file={file}
              onFile={(nextFile, error) => {
                setFile(nextFile);
                if (!nextFile) setDocumentTypeId(editingDocument?.documentTypeId || '');
                if (error) setFeedback({ type: 'error', text: error });
              }}
            />
            {file || editingDocument?.privateFile ? (
              <DocumentTypeField
                types={options?.documentTypes || listData?.documentTypes || []}
                value={documentTypeId}
                onChange={setDocumentTypeId}
              />
            ) : null}
          </div>
          <WorkAssignmentRows
            assignments={assignments}
            onChange={setAssignments}
            departments={options.departments}
            users={assignableUsers}
            showDepartments={options.canAssignDepartments ?? options.isOps !== false}
          />
          {showReapprovalWarning ? (
            <p className="work-reapproval-warning" role="note">{WORK_REAPPROVAL_WARNING}</p>
          ) : null}
          {formRequiresApproval && !canPickApprovers ? (
            <p className="work-muted">Sau khi lưu, công việc được gửi lại cho người duyệt hiện tại.</p>
          ) : formRequiresApproval ? (
            <WorkApproverPicker
              approvers={options.approvers || []}
              value={approverIds}
              onChange={(next) => {
                setApproverIds(next);
                if (next.length) setApproverError('');
              }}
              error={approverError}
            />
          ) : (editingDocument ? editingDocument.approvalFlow : options?.requiresApproval) ? (
            <p className="work-muted">Việc chỉ giao cho chính bạn không cần Ban giám hiệu duyệt và được giao ngay.</p>
          ) : null}
          {feedback.text ? <div className={`work-feedback ${feedback.type}`}>{feedback.text}</div> : null}
          <div className="work-editor-actions duty-editor-actions">
            <button type="button" className="work-ghost-button" onClick={editingDocument ? () => setEditConfirm('cancel') : reset}>{editingDocument ? 'Hủy sửa' : 'Xóa biểu mẫu'}</button>
            <button type="submit" className="work-primary-button" disabled={saving}>
              {saving
                ? (editingDocument ? 'Đang lưu…' : 'Đang tạo…')
                : pendingSettlement
                  ? 'Thử hoàn tất lại'
                  : editingDocument
                    ? (formRequiresApproval ? 'Lưu và gửi duyệt lại' : 'Lưu thay đổi')
                    : (formRequiresApproval ? 'Gửi duyệt' : 'Tạo')}
            </button>
          </div>
        </form>
      ) : null}

      {previewOpen ? (
        <WorkCreatePreview
          title={title}
          fileName={file?.name || ''}
          assignments={assignments}
          catalogs={options}
          approverNames={needsApproverPick
            ? (options?.approvers || [])
                .filter((person) => approverIds.includes(String(person._id)))
                .map((person) => person.name)
            : null}
          pending={saving}
          onCancel={() => setPreviewOpen(false)}
          onConfirm={() => void persistWork()}
        />
      ) : null}

      <EditActionConfirm
        action={editConfirm}
        onDismiss={() => setEditConfirm(null)}
        onConfirmCancel={() => closeEditor()}
        onConfirmSave={() => {
          setEditConfirm(null);
          void persistWork();
        }}
      />

      {!hideCompletionQueue && pendingCompletionReviews.length ? (
        <section className="work-completion-queue">
          <header>
            <div>
              <span>DUYỆT HOÀN THÀNH</span>
              <h3>{pendingCompletionReviews.length} task đang chờ duyệt</h3>
            </div>
          </header>
          <div className="work-user-list">
            {pendingCompletionReviews.map((item) => (
              <article className="work-user-card pending-completion-card" key={`${item.kind}-${item.taskId || item.workItemId}-${item.userId}`}>
                <div className="work-completion-card-content">
                  <span className="work-card-eyebrow">{item.departmentName}</span>
                  <h3>{item.content}</h3>
                  <div className="work-card-meta">
                    <span>Người nộp <strong>{item.userName}</strong></span>
                    <span>Hạn <strong>{formatWorkDate(item.deadline)}</strong></span>
                    {item.submittedLate ? <span className="work-late-flag">Nộp trễ</span> : null}
                  </div>
                  <SubmitterNote note={item.note} />
                </div>
                <div className="work-completion-review-actions">
                  <WorkStatus status="pending_completion" />
                  <button type="button" className="work-primary-button" onClick={() => setReviewing(item)}>
                    Duyệt / Chưa duyệt
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="duty-list-section">
        <DutyListHeading>Việc tôi tạo</DutyListHeading>
        <div className="duty-list-toolbar">
          <WorkListTabs tab={listTab} onChange={setListTab} counts={createdTabCounts} />
          {allowCreate && !open ? (
            <button type="button" className="work-primary-button" onClick={() => setOpen(true)}>
              <span>+</span> Tạo công việc
            </button>
          ) : null}
        </div>
        <WorkListSearch value={listSearch} onChange={setListSearch} />
        {visibleDocuments.length === 0 ? (
          <WorkListEmpty tab={listTab} tone="created" />
        ) : filteredDocuments.length === 0 ? (
          <WorkListEmpty filtered />
        ) : (
          <div className="duty-modern-list">
            {filteredDocuments.map((document) => {
              const cardOpen = String(expanded || '') === String(document._id);
              return (
                <article
                  className={`duty-modern-card ${cardOpen ? 'is-open' : ''}`}
                  key={document._id}
                  data-focus-id={document._id}
                  data-document-id={document._id}
                >
                  <button
                    type="button"
                    className="duty-card-toggle"
                    onClick={() => setExpanded(cardOpen ? null : document._id)}
                    aria-expanded={cardOpen}
                    aria-label={cardOpen ? 'Thu gọn' : 'Chi tiết'}
                    title={cardOpen ? 'Thu gọn' : 'Chi tiết'}
                  >
                    <WorkListSummary
                      item={document}
                      status={<WorkStatus status={document.workStatus || document.status} />}
                    />
                    <WorkExpandHint open={cardOpen} />
                  </button>
                  <div className="row-actions duty-actions">
                    <WorkChatButton documentId={document._id} title={document.title || document.fileName} />
                    {document.canEdit ? (
                      <WorkIconButton
                        className="work-edit-button"
                        title="Sửa"
                        onClick={() => startEdit(document)}
                        disabled={saving}
                      >
                        <PencilIcon />
                      </WorkIconButton>
                    ) : null}
                    {document.canDelete ? (
                      <WorkIconButton
                        className="work-delete-button"
                        title="Xóa"
                        onClick={() => void removeDocument(document)}
                        disabled={saving}
                      >
                        <TrashIcon />
                      </WorkIconButton>
                    ) : null}
                  </div>
                  {document.canEdit || document.canDelete || !(document.hasSubmissions || document.approvalLocked) ? null : (
                    <p className="work-document-locked">
                      {document.hasSubmissions
                        ? WORK_HAS_SUBMISSIONS_NOTE
                        : 'Ban giám hiệu đã duyệt · Không thể sửa hoặc xóa'}
                    </p>
                  )}
                  {document.approvalTotal > 0 && (document.status !== 'approved' || cardOpen) ? (
                    <div className="duty-detail">
                      <WorkApprovalProgress document={document} />
                    </div>
                  ) : null}
                  {cardOpen ? (
                    <div className="duty-detail">
                      {document.privateFile && document.fileName ? (
                        <div className="work-document-meta">
                          <span>Tệp đính kèm</span>
                          <PrivateFileLink
                            documentId={document._id}
                            fileName={document.fileName}
                            fileUrl={document.fileUrl}
                            privateFile={document.privateFile}
                          >
                            {document.fileName} · {fileSizeLabel(document.fileSize)}
                            {document.documentTypeName ? ` · ${document.documentTypeName}` : ''}
                          </PrivateFileLink>
                        </div>
                      ) : null}
                      {document.assignments.map((assignment) => (
                        <section key={assignment._id || assignment.departmentId} data-focus-id={assignment._id || undefined}>
                          <header>
                            <strong>
                              {assignment.type === 'individual' ? 'Cá nhân' : assignment.departmentName}
                            </strong>
                            <WorkStatus status={workAssignmentDisplayStatus(document, assignment)} />
                          </header>
                          <p>{assignment.content}</p>
                          <small>
                            Hạn {formatWorkDate(assignment.deadline)}
                            {assignment.taskCount != null && !isWorkDocumentUnreleased(document)
                              ? ` · ${assignment.taskCompletedCount || 0}/${assignment.taskCount} hoàn thành`
                              : ''}
                          </small>
                          {assignment.members?.length ? (
                            <div className="work-member-progress">
                              {assignment.members.map((member) => (isWorkDocumentUnreleased(document) ? (
                                // Not handed out yet: list who will receive it, without progress.
                                <span key={member._id} className="work-member-chip status-unreleased">{member.name}</span>
                              ) : (
                                <span key={member._id} className={`work-member-chip status-${member.status}`}>
                                  {member.name} · {workStatusLabel(member.status)}
                                  {member.qualityPercent != null ? ` · ${member.qualityPercent}%` : ''}
                                </span>
                              )))}
                            </div>
                          ) : null}
                        </section>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
      {reviewing ? (
        <CompletionReviewModal
          item={reviewing}
          onClose={() => setReviewing(null)}
          onSubmit={submitReview}
          saving={reviewSaving}
        />
      ) : null}
    </section>
  );
}

function PersonalTaskAssignModal({ work, users, onClose, onSubmit, saving }) {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState(work.deadline);
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [personQuery, setPersonQuery] = useState('');
  const visibleUsers = filterByPickerSearch(users, personQuery, personPickerHaystack);
  return (
    <div className="work-modal-backdrop" role="presentation">
      <form className="work-modal" onSubmit={(event) => { event.preventDefault(); onSubmit({ title, deadline, assigneeUserIds: assigneeIds }); }}>
        <button type="button" className="work-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="work-kicker">Công việc cá nhân</span>
        <h3>Chỉ định đầu mục</h3>
        <p className="work-modal-context">{work.departmentName} · Hạn phòng ban {formatWorkDate(work.deadline)}</p>
        <label className="work-field-label" htmlFor="personal-title">Tên công việc <small>{title.length}/200</small></label>
        <input id="personal-title" type="text" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Tổng hợp danh sách hồ sơ…" required />
        <label className="work-field-label" htmlFor="personal-deadline">Hạn chót hoàn thành</label>
        <input id="personal-deadline" type="date" min={new Date().toISOString().slice(0, 10)} value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
        <div className="work-field-label">Người thực hiện <small>{assigneeIds.length} người</small></div>
        {users.length ? (
          <input
            className="work-person-search"
            type="search"
            value={personQuery}
            autoComplete="off"
            placeholder="Tìm người thực hiện…"
            aria-label="Tìm người thực hiện"
            onChange={(event) => setPersonQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
          />
        ) : null}
        <div className="work-assignee-list">
          {visibleUsers.map((person) => (
            <label key={person._id} className={assigneeIds.includes(person._id) ? 'is-selected' : ''}>
              <input type="checkbox" checked={assigneeIds.includes(person._id)} onChange={() => setAssigneeIds((current) => current.includes(person._id) ? current.filter((id) => id !== person._id) : [...current, person._id])} />
              <span className="work-person-avatar" aria-hidden="true">{String(person.name).trim().slice(0, 1).toUpperCase()}</span>
              <span><strong>{person.name}</strong><small>{person.positionName || 'Chưa gán chức vụ'}</small></span>
            </label>
          ))}
          {!users.length ? <p className="work-muted">Không có user cấp thấp hơn cùng phòng ban.</p> : null}
          {users.length && !visibleUsers.length ? <p className="work-muted">Không tìm thấy người phù hợp.</p> : null}
        </div>
        <div className="work-modal-actions">
          <button type="button" className="work-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="work-primary-button" disabled={saving || !assigneeIds.length}>{saving ? 'Đang lưu…' : 'Giao công việc'}</button>
        </div>
      </form>
    </div>
  );
}

export function WorkUserView(props) {
  return (
    <PersonalReminderQueryBoundary fallback={<WorkUserViewBody {...props} reminderFailed />}>
      <WorkUserViewBody {...props} />
    </PersonalReminderQueryBoundary>
  );
}

function WorkUserViewBody({ focusTarget = null, reminderFailed = false }) {
  const data = useQuery(anyApi.work.listMine);
  const { fetchAccessToken } = useConvexAuth();
  const approveDocument = useMutation(anyApi.work.approveDocument);
  const rejectDocument = useMutation(anyApi.work.rejectDocument);
  const createPersonalTask = useMutation(anyApi.work.createPersonalTask);
  const completePersonalTask = useMutation(anyApi.work.completePersonalTask);
  const completeWorkItem = useMutation(anyApi.work.completeWorkItem);
  const ensureDocumentTypes = useMutation(anyApi.documentTypes.ensureDefaults);
  const reviewWorkCompletion = useMutation(anyApi.work.reviewWorkCompletion);
  const reviewPersonalCompletion = useMutation(anyApi.work.reviewPersonalCompletion);
  const [assigning, setAssigning] = useState(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(null);
  const [completingSaving, setCompletingSaving] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [deciding, setDeciding] = useState(null);
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [listTab, setListTab] = useState(WORK_LIST_TAB_TODO);
  const [listSearch, setListSearch] = useState(emptyWorkSearch);
  const [expanded, setExpanded] = useState(null);
  const isApprover = (data?.level || 0) >= 4;
  const isAssigner = data?.level === 2 || data?.level === 3;
  const isAdminMod = (data?.assignerMode || 'admin_mod') === 'admin_mod';
  const pendingCompletionReviews = data?.pendingCompletionReviews || [];
  const myWorkReminders = useQuery(
    anyApi.personalReminders.listMine,
    reminderFailed ? 'skip' : { kind: 'work' },
  );
  const workReminderMap = useMemo(() => reminderMapFromList(myWorkReminders), [myWorkReminders]);
  const showWorkReminders = !reminderFailed && workTabAllowsPersonalReminder(listTab);

  useNotificationFocus(focusTarget, {
    acceptSourceTypes: WORK_NOTIFICATION_FOCUS_TYPES,
  });
  const workChatModal = useNotificationChatModal(focusTarget, 'work_chat');

  useEffect(() => {
    void ensureDocumentTypes({}).catch(() => {});
  }, [ensureDocumentTypes]);

  const visibleMyTasks = useMemo(() => filterWorksByTab(data?.myTasks || [], listTab), [data?.myTasks, listTab]);
  const visibleDepartmentWorks = useMemo(
    () => filterWorksByTab(data?.departmentWorks || [], listTab),
    [data?.departmentWorks, listTab],
  );
  const visiblePersonalTasks = useMemo(
    () => filterWorksByTab(data?.personalTasks || [], listTab),
    [data?.personalTasks, listTab],
  );
  const filteredMyTasks = useMemo(
    () => filterWorksBySearch(visibleMyTasks, listSearch),
    [visibleMyTasks, listSearch],
  );
  const filteredDepartmentWorks = useMemo(
    () => filterWorksBySearch(visibleDepartmentWorks, listSearch),
    [visibleDepartmentWorks, listSearch],
  );
  const filteredPersonalTasks = useMemo(
    () => filterWorksBySearch(visiblePersonalTasks, listSearch),
    [visiblePersonalTasks, listSearch],
  );
  const mineTabCounts = useMemo(() => {
    const source = isAdminMod
      ? (data?.myTasks || [])
      : isAssigner
        ? (data?.departmentWorks || [])
        : (data?.personalTasks || []);
    return workListTabCounts(source);
  }, [data, isAdminMod, isAssigner]);

  const workChatFocus = useMemo(
    () => findWorkChatFocusItem({
      myTasks: data?.myTasks,
      departmentWorks: data?.departmentWorks,
      personalTasks: data?.personalTasks,
    }, workChatModal.entityId || focusTarget?.sourceId),
    [data?.myTasks, data?.departmentWorks, data?.personalTasks, workChatModal.entityId, focusTarget?.sourceId],
  );

  useEffect(() => {
    if (focusTarget?.sourceType !== 'work_chat' || !focusTarget?.sourceId || !data) return;
    const match = findWorkChatFocusItem({
      myTasks: data.myTasks,
      departmentWorks: data.departmentWorks,
      personalTasks: data.personalTasks,
    }, focusTarget.sourceId);
    if (!match) return;
    setListTab(workListTabOf(match.item));
    setListSearch(emptyWorkSearch());
    setExpanded(match.expandId);
  }, [focusTarget?.token, focusTarget?.sourceId, focusTarget?.sourceType, data]);

  const workChatDialog = workChatModal.open ? (
    <WorkTaskChatModal
      documentId={workChatModal.entityId}
      title={workChatFocus?.title || 'Công việc'}
      onClose={workChatModal.close}
    />
  ) : null;

  if (data === undefined) {
    return (
      <>
        <div className="work-loading">Đang tải công việc của bạn…</div>
        {workChatDialog}
      </>
    );
  }

  const handleAssign = async ({ title, deadline, assigneeUserIds }) => {
    setSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      await createPersonalTask({ workItemId: assigning._id, title, deadline, assigneeUserIds });
      setAssigning(null);
      setFeedback({ type: 'success', text: 'Đã giao đầu mục công việc cá nhân.' });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể giao công việc. Vui lòng kiểm tra người thực hiện và hạn chót.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async ({ decision, reason }) => {
    if (!deciding) return;
    const documentId = deciding.document._id;
    setDecisionSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      if (decision === 'approve') {
        await approveDocument({ documentId });
        setFeedback({ type: 'success', text: 'Bạn đã duyệt công việc.' });
      } else {
        await rejectDocument({ documentId, reason });
        setFeedback({ type: 'success', text: 'Đã trả lại công việc cho người tạo.' });
      }
      setDeciding(null);
    } catch (error) {
      setDeciding(null);
      setFeedback({ type: 'error', text: messageFor(error) });
    } finally {
      setDecisionSaving(false);
    }
  };

  const approvals = data.approvals || [];
  const awaitingApprovals = approvals.filter((document) => document.awaitingMyDecision);
  const decidedApprovals = approvals.filter((document) => !document.awaitingMyDecision);
  const renderApprovalCard = (document) => (
    <article className="work-user-card approval-card" key={document._id} data-focus-id={document._id}>
      <div className="work-user-card-top">
        <span className="work-card-eyebrow">
          {workCreatorLabel(document)}
          {document.submittedAt ? ` · gửi ${formatWorkDateTime(document.submittedAt)}` : ''}
        </span>
        <WorkStatus status={document.status} />
      </div>
      <h3>{document.title || document.fileName}</h3>
      {workLastEditedLabel(document) ? (
        <p className="work-edited-note">{workLastEditedLabel(document)}</p>
      ) : null}
      {document.privateFile && document.fileName ? (
        <PrivateFileLink
          className="work-file-link"
          documentId={document._id}
          fileName={document.fileName}
          fileUrl={document.fileUrl}
          privateFile={document.privateFile}
        >
          {document.fileName}
        </PrivateFileLink>
      ) : null}
      <div className="work-document-assignments">
        {(document.assignments || []).map((assignment) => (
          <section key={assignment._id || `${assignment.departmentId}-${assignment.content}`}>
            <header>
              <strong>{assignment.type === 'individual' ? 'Cá nhân' : assignment.departmentName}</strong>
            </header>
            <p>{assignment.content}</p>
            <small>Hạn {formatWorkDate(assignment.deadline)} · {assignment.taskCount || 0} người</small>
          </section>
        ))}
      </div>
      <WorkApprovalProgress document={document} />
      {document.awaitingMyDecision ? (
        <div className="work-approval-actions">
          {document.canReject ? (
            <button
              type="button"
              className="work-reject-button"
              disabled={decisionSaving}
              onClick={() => setDeciding({ document, mode: 'reject' })}
            >
              Trả lại
            </button>
          ) : null}
          <button
            type="button"
            className="work-primary-button"
            disabled={decisionSaving}
            onClick={() => setDeciding({ document, mode: 'approve' })}
          >
            Duyệt
          </button>
        </div>
      ) : null}
    </article>
  );

  /** @param {{ uploaded?: { driveFileId: string, driveChecksum?: string, cleanupToken: string, fileName: string, fileType: string, fileSize: number }, note?: string, documentTypeId?: string }} [result] */
  const handleCompleteWorkItem = async (result = {}) => {
    const { uploaded, note, documentTypeId } = result;
    if (!completing || !uploaded) return;
    setCompletingSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      await completeWorkItem({
        workItemId: completing._id,
        driveFileId: uploaded.driveFileId,
        driveChecksum: uploaded.driveChecksum,
        cleanupToken: uploaded.cleanupToken,
        fileName: uploaded.fileName,
        fileType: uploaded.fileType,
        fileSize: uploaded.fileSize,
        documentTypeId,
        ...(note ? { note } : {}),
      });
      await settleWorkUploadedFile(fetchAccessToken, uploaded.cleanupToken, true);
      setCompleting(null);
      setFeedback({ type: 'success', text: 'Đã nộp công việc. Người tạo sẽ đánh dấu hoàn thành.' });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể đánh dấu hoàn thành lúc này.' });
    } finally {
      setCompletingSaving(false);
    }
  };

  /** @param {{ qualityPercent?: number, note?: string }} [result] */
  const handleCompletePersonal = async (result = {}) => {
    const { qualityPercent, note } = result;
    if (!completing) return;
    setCompletingSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      await completePersonalTask({
        taskId: completing._id,
        ...(qualityPercent !== undefined ? { qualityPercent } : {}),
        ...(note ? { note } : {}),
      });
      setCompleting(null);
      setFeedback({
        type: 'success',
        text: data?.isAdmin ? 'Đã ghi nhận hoàn thành.' : 'Đã gửi duyệt hoàn thành.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể hoàn thành đầu mục này.' });
    } finally {
      setCompletingSaving(false);
    }
  };

  const submitReview = async ({ decision, qualityPercent, rejectionReason }) => {
    if (!reviewing) return;
    setReviewSaving(true);
    setFeedback({ type: '', text: '' });
    try {
      if (reviewing.kind === 'personal_task') {
        await reviewPersonalCompletion({
          taskId: reviewing.taskId,
          userId: reviewing.userId,
          decision,
          qualityPercent,
          rejectionReason,
        });
      } else {
        await reviewWorkCompletion({
          workItemId: reviewing.workItemId,
          userId: reviewing.userId,
          decision,
          qualityPercent,
          rejectionReason,
        });
      }
      setReviewing(null);
      setFeedback({
        type: 'success',
        text: decision === 'approve' ? 'Đã duyệt hoàn thành task.' : 'Đã từ chối và trả task về cho user.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Không thể duyệt hoàn thành lúc này.' });
    } finally {
      setReviewSaving(false);
    }
  };

  return (
    <>
    <section className="work-user-view duty-workspace">
      {feedback.text ? <div className={`work-feedback ${feedback.type}`}>{feedback.text}</div> : null}

      {pendingCompletionReviews.length ? (
        <section className="work-completion-queue">
          <header>
            <div>
              <span>DUYỆT HOÀN THÀNH</span>
              <h3>{pendingCompletionReviews.length} task đang chờ bạn duyệt</h3>
            </div>
          </header>
          <div className="work-user-list">
            {pendingCompletionReviews.map((item) => (
              <article className="work-user-card pending-completion-card" key={`${item.kind}-${item.taskId || item.workItemId}-${item.userId}`}>
                <div className="work-completion-card-content">
                  <span className="work-card-eyebrow">{item.departmentName}</span>
                  <h3>{item.content}</h3>
                  <div className="work-card-meta">
                    <span>Người nộp <strong>{item.userName}</strong></span>
                    <span>Hạn <strong>{formatWorkDate(item.deadline)}</strong></span>
                  </div>
                  <SubmitterNote note={item.note} />
                </div>
                <div className="work-completion-review-actions">
                  <WorkStatus status="pending_completion" />
                  <button type="button" className="work-primary-button" onClick={() => setReviewing(item)}>
                    Duyệt / Chưa duyệt
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {approvals.length ? (
        <section className="duty-list-section work-approval-queue" aria-label="Công việc chờ tôi duyệt">
          <DutyListHeading>Chờ tôi duyệt</DutyListHeading>
          {awaitingApprovals.length ? (
            <div className="work-user-list">{awaitingApprovals.map(renderApprovalCard)}</div>
          ) : (
            <div className="work-empty">
              <h3>Không có công việc chờ bạn duyệt</h3>
              <p>Khi Văn thư/Quản trị gửi công việc cần Ban giám hiệu duyệt, công việc sẽ xuất hiện tại đây.</p>
            </div>
          )}
          {decidedApprovals.length ? (
            <details className="work-approval-history">
              <summary>Đã xử lý trong 30 ngày ({decidedApprovals.length})</summary>
              <div className="work-user-list">{decidedApprovals.map(renderApprovalCard)}</div>
            </details>
          ) : null}
        </section>
      ) : null}

      {isAdminMod || isAssigner || (!isAdminMod && !isApprover && !isAssigner) ? (
        <div className="duty-list-section">
          <DutyListHeading>Việc của tôi</DutyListHeading>
          <div className="duty-list-toolbar">
            <WorkListTabs tab={listTab} onChange={setListTab} counts={mineTabCounts} />
          </div>
          <WorkListSearch value={listSearch} onChange={setListSearch} />
          {isAdminMod ? (
            visibleMyTasks.length === 0 ? <WorkListEmpty tab={listTab} /> : filteredMyTasks.length === 0 ? <WorkListEmpty filtered /> : (
              <div className="duty-modern-list">
                {filteredMyTasks.map((task) => {
                  const cardOpen = String(expanded || '') === String(task._id);
                  return (
                    <article className={`duty-modern-card ${cardOpen ? 'is-open' : ''}`} key={task._id} data-focus-id={task._id} data-document-id={task.documentId}>
                      <PersonalReminderLayout
                        show={showWorkReminders}
                        panel={(
                          <PersonalReminderPanel
                            kind="work"
                            sourceType={workReminderSourceType(task)}
                            sourceId={task._id}
                            label="Công việc"
                            reminder={workReminderMap.get(String(task._id))}
                            locked={task.status === 'overdue'}
                          />
                        )}
                      >
                      <button
                        type="button"
                        className="duty-card-toggle"
                        onClick={() => setExpanded(cardOpen ? null : task._id)}
                        aria-expanded={cardOpen}
                        aria-label={cardOpen ? 'Thu gọn' : 'Chi tiết'}
                        title={cardOpen ? 'Thu gọn' : 'Chi tiết'}
                      >
                        <WorkListSummary
                          item={task}
                          status={<WorkStatus status={task.status === 'pending' ? 'pending_task' : task.status} />}
                        />
                        <WorkExpandHint open={cardOpen} />
                      </button>
                      <div className="row-actions duty-actions">
                        <WorkChatButton documentId={task.documentId} title={task.documentTitle || task.content} />
                        {task.status === 'pending' || task.status === 'pending_task' || task.status === 'overdue' || task.status === 'rejected_completion' ? (
                          <button
                            type="button"
                            className="work-primary-button"
                            onClick={() => setCompleting({ ...task, mode: 'work_item' })}
                          >
                            {task.status === 'overdue' || task.status === 'rejected_completion'
                              ? 'Nộp lại bằng chứng hoàn thành'
                              : 'Nộp bằng chứng hoàn thành'}
                          </button>
                        ) : null}
                      </div>
                      {cardOpen ? (
                        <div className="duty-detail">
                          {task.rejectionReason ? (
                            <div className="work-rejection-banner" role="status">
                              <strong>Lý do chưa duyệt</strong>
                              <p>{task.rejectionReason}</p>
                            </div>
                          ) : null}
                          <SubmitterNote note={task.completion?.note} label="Nội dung đã gửi người giao" />
                          <PrivateFileLink
                            className="work-file-link"
                            documentId={task.documentId}
                            fileName={task.fileName}
                            fileUrl={task.fileUrl}
                            privateFile={task.privateFile}
                          >
                            {task.fileName || 'Công văn đính kèm'}
                          </PrivateFileLink>
                          {task.type === 'department' && task.pendingMembers?.length ? (
                            <div className="work-member-progress">
                              <strong className="work-pending-label">Chưa xong / chờ duyệt:</strong>
                              {task.pendingMembers.map((member) => (
                                <span key={member._id} className={`work-member-chip status-${member.status}`}>
                                  {member.name}
                                  {member.qualityPercent != null ? ` · ${member.qualityPercent}%` : ''}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {task.type === 'department' && task.members?.length ? (
                            <details className="work-member-details">
                              <summary>Xem tiến độ cả phòng ban ({task.members.length})</summary>
                              <div className="work-member-progress">
                                {task.members.map((member) => (
                                  <span key={member._id} className={`work-member-chip status-${member.status}`}>
                                    {member.name} · {workStatusLabel(member.status)}
                                    {member.qualityPercent != null ? ` · ${member.qualityPercent}%` : ''}
                                  </span>
                                ))}
                              </div>
                            </details>
                          ) : null}
                          {task.status === 'pending_completion' ? (
                            <small className="work-overdue-note">Đang chờ Admin/Mod duyệt hoàn thành.</small>
                          ) : null}
                          {task.status === 'completed_late' ? (
                            <small className="work-overdue-note">Đã hoàn thành trễ hạn — sẽ ghi nhận vào KPI.</small>
                          ) : null}
                        </div>
                      ) : null}
                      </PersonalReminderLayout>
                    </article>
                  );
                })}
              </div>
            )
          ) : null}

          {!isAdminMod && isAssigner ? (
            visibleDepartmentWorks.length === 0 ? <WorkListEmpty tab={listTab} /> : filteredDepartmentWorks.length === 0 ? <WorkListEmpty filtered /> : (
              <div className="duty-modern-list">
                {filteredDepartmentWorks.map((work) => {
                  const cardOpen = String(expanded || '') === String(work._id);
                  return (
                    <article className={`duty-modern-card ${cardOpen ? 'is-open' : ''}`} key={work._id} data-focus-id={work._id} data-document-id={work.documentId}>
                      <button
                        type="button"
                        className="duty-card-toggle"
                        onClick={() => setExpanded(cardOpen ? null : work._id)}
                        aria-expanded={cardOpen}
                        aria-label={cardOpen ? 'Thu gọn' : 'Chi tiết'}
                        title={cardOpen ? 'Thu gọn' : 'Chi tiết'}
                      >
                        <WorkListSummary item={work} status={<WorkStatus status={work.status} />} />
                        <WorkExpandHint open={cardOpen} />
                      </button>
                      <div className="row-actions duty-actions">
                        <WorkChatButton documentId={work.documentId} title={work.document?.title || work.content} />
                        <button type="button" className="work-outline-button" onClick={() => setAssigning(work)}>＋ Chỉ định công việc cá nhân</button>
                      </div>
                      {cardOpen ? (
                        <div className="duty-detail">
                          <DepartmentProgress status={work.status} taskCount={work.tasks.length} />
                          <div className="work-task-list">
                            {work.tasks.map((task) => (
                              <div className="work-task-row" key={task._id}>
                                <span>
                                  <strong>{task.title}</strong>
                                  <small>Hạn {formatWorkDate(task.deadline)} · {task.assignees.map((person) => person.name).join(', ')}</small>
                                </span>
                                <WorkStatus status={
                                  task.status === 'completed' || task.status === 'completed_late' || task.status === 'pending_completion' || task.status === 'rejected_completion'
                                    ? task.status
                                    : task.status === 'overdue'
                                      ? 'not_completed'
                                      : 'in_progress'
                                } />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )
          ) : null}

          {!isAdminMod && !isApprover && !isAssigner ? (
            visiblePersonalTasks.length === 0 ? <WorkListEmpty tab={listTab} /> : filteredPersonalTasks.length === 0 ? <WorkListEmpty filtered /> : (
              <div className="duty-modern-list">
                {filteredPersonalTasks.map((task) => {
                  const cardOpen = String(expanded || '') === String(task._id);
                  return (
                    <article className={`duty-modern-card ${cardOpen ? 'is-open' : ''}`} key={task._id} data-focus-id={task._id} data-document-id={task.documentId}>
                      <PersonalReminderLayout
                        show={showWorkReminders}
                        panel={(
                          <PersonalReminderPanel
                            kind="work"
                            sourceType="personal_task"
                            sourceId={task._id}
                            label="Công việc"
                            reminder={workReminderMap.get(String(task._id))}
                            locked={task.status === 'overdue'}
                          />
                        )}
                      >
                      <button
                        type="button"
                        className="duty-card-toggle"
                        onClick={() => setExpanded(cardOpen ? null : task._id)}
                        aria-expanded={cardOpen}
                        aria-label={cardOpen ? 'Thu gọn' : 'Chi tiết'}
                        title={cardOpen ? 'Thu gọn' : 'Chi tiết'}
                      >
                        <WorkListSummary
                          item={task}
                          status={<WorkStatus status={task.status === 'pending' ? 'pending_task' : task.status} />}
                        />
                        <WorkExpandHint open={cardOpen} />
                      </button>
                      <div className="row-actions duty-actions">
                        <WorkChatButton documentId={task.documentId} title={task.documentTitle || task.title} />
                        {task.status === 'pending' || task.status === 'pending_task' || task.status === 'overdue' || task.status === 'rejected_completion' ? (
                          <button
                            type="button"
                            className="work-primary-button"
                            onClick={() => setCompleting({ ...task, mode: 'personal_task', content: task.title })}
                          >
                            {task.status === 'overdue' || task.status === 'rejected_completion'
                              ? 'Nộp lại bằng chứng hoàn thành'
                              : 'Nộp bằng chứng hoàn thành'}
                          </button>
                        ) : null}
                      </div>
                      {cardOpen ? (
                        <div className="duty-detail">
                          {task.rejectionReason ? (
                            <div className="work-rejection-banner" role="status">
                              <strong>Lý do chưa duyệt</strong>
                              <p>{task.rejectionReason}</p>
                            </div>
                          ) : null}
                          <SubmitterNote note={task.completion?.note} label="Nội dung đã gửi người giao" />
                          <PrivateFileLink
                            className="work-file-link"
                            documentId={task.documentId}
                            fileName={task.fileName}
                            fileUrl={task.fileUrl}
                            privateFile={task.privateFile}
                          >
                            {task.fileName || 'Công văn đính kèm'}
                          </PrivateFileLink>
                          {task.status === 'pending_completion' ? (
                            <small className="work-overdue-note">Đang chờ cấp trên duyệt hoàn thành.</small>
                          ) : null}
                          {task.status === 'completed_late' ? (
                            <small className="work-overdue-note">Đã hoàn thành trễ hạn — sẽ ghi nhận vào KPI.</small>
                          ) : null}
                        </div>
                      ) : null}
                      </PersonalReminderLayout>
                    </article>
                  );
                })}
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {assigning ? <PersonalTaskAssignModal work={assigning} users={data.assignableUsers} onClose={() => setAssigning(null)} onSubmit={handleAssign} saving={saving} /> : null}
      {completing ? (
        <CompletionSubmitModal
          title={completing.content || completing.title}
          saving={completingSaving}
          documentTypes={data?.documentTypes || []}
          requireDocumentType={completing.mode !== 'personal_task'}
          onClose={() => setCompleting(null)}
          onSubmit={completing.mode === 'personal_task' ? handleCompletePersonal : handleCompleteWorkItem}
        />
      ) : null}
      {reviewing ? (
        <CompletionReviewModal
          item={reviewing}
          onClose={() => setReviewing(null)}
          onSubmit={submitReview}
          saving={reviewSaving}
        />
      ) : null}
      {deciding ? (
        <WorkDocumentDecisionModal
          document={deciding.document}
          mode={deciding.mode}
          onClose={() => setDeciding(null)}
          onSubmit={(result) => void handleDecision(result)}
          saving={decisionSaving}
        />
      ) : null}
    </section>
      {data.canCreate ?<WorkManagement allowCreate hideCompletionQueue focusTarget={focusTarget} /> : null}
      {workChatDialog}
    </>
  );
}
