import React, { useMemo, useState } from 'react';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import './peopleReview.css';
import { boardingPeriodLabel } from '../boarding/boardingLabels.js';
import { messageFor } from '../lib/appErrorMessage';
import { PEOPLE_NOTIFICATION_FOCUS_TYPES, useNotificationFocus } from '../notifications/useNotificationFocus';

const ACCEPTED = ['pdf', 'png', 'jpg', 'jpeg'];

export function todayIso() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('vi-VN', { hour12: false });
}

function currentSchoolYear() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const start = month >= 9 ? year : year - 1;
  return `${start}-${start + 1}`;
}

function currentQuarter() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return { year: now.getUTCFullYear(), quarter: Math.floor(now.getUTCMonth() / 3) + 1 };
}

function periodLabel(file) {
  if (file.kind === 'quarterly') return `Quý ${file.quarter}/${file.year}`;
  if (file.kind === 'civil_servant') return `Năm học ${file.schoolYear}`;
  if (file.kind === 'boarding') return boardingPeriodLabel(file);
  return file.periodKey;
}

async function uploadDriveFile(fetchAccessToken, file) {
  const token = await fetchAccessToken({ forceRefreshToken: false });
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch('/api/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
      'X-LVT-Upload-Purpose': 'people-review',
    },
    body: file,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.driveFileId || !result?.cleanupToken) {
    const code = result?.error || `UPLOAD_FAILED:${response.status}`;
    throw new Error(code);
  }
  return result;
}

async function settleUploadedFile(fetchAccessToken, cleanupToken, committed) {
  if (!cleanupToken) return;
  const token = await fetchAccessToken({ forceRefreshToken: false });
  if (!token) throw new Error('AUTH_REQUIRED');
  const response = await fetch(`/api/files/uploads/${encodeURIComponent(cleanupToken)}`, {
    method: committed ? 'POST' : 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`UPLOAD_SETTLEMENT_FAILED:${response.status}`);
  }
}

async function runCleanupJob(fetchAccessToken, cleanupJobId) {
  try {
    const token = await fetchAccessToken({ forceRefreshToken: false });
    if (!token) return;
    const response = await fetch(`/api/files/cleanup-jobs/people-review/${encodeURIComponent(cleanupJobId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok && response.status !== 404) {
      console.error('Superseded Drive file cleanup failed', response.status);
    }
  } catch (error) {
    console.error('Superseded Drive file cleanup failed', error);
  }
}

export function PrivateFileButton({ kind, fileId, fileName, className = 'pr-file-link' }) {
  const { fetchAccessToken } = useConvexAuth();
  const [opening, setOpening] = useState(false);
  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const token = await fetchAccessToken({ forceRefreshToken: false });
      if (!token) throw new Error('AUTH_REQUIRED');
      const response = await fetch(
        `/api/people-review/files/${kind}/${encodeURIComponent(fileId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error(`DOWNLOAD_FAILED:${response.status}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement('a');
      anchor.href = objectUrl;
      anchor.target = '_blank';
      anchor.rel = 'noreferrer';
      anchor.download = fileName || '';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      console.error(error);
      window.alert('Không thể mở tệp. Vui lòng thử lại.');
    } finally {
      setOpening(false);
    }
  };
  return (
    <button type="button" className={className} onClick={() => void open()} disabled={opening}>
      {opening ? 'Đang mở…' : `↗ ${fileName || 'Mở tệp'}`}
    </button>
  );
}

export function DateRangeFilter({ from, to, onChange, label }) {
  return (
    <div className="pr-date-filter">
      <span>{label}</span>
      <label>
        Từ
        <input type="date" value={from} onChange={(event) => onChange({ from: event.target.value, to })} />
      </label>
      <label>
        Đến
        <input type="date" value={to} onChange={(event) => onChange({ from, to: event.target.value })} />
      </label>
    </div>
  );
}

function FaultList({ faults }) {
  if (!faults.length) return <div className="pr-empty">Không có ghi nhận lỗi trong khoảng thời gian này.</div>;
  return (
    <div className="pr-fault-list">
      {faults.map((fault) => (
        <article className="pr-fault-card" key={fault._id} data-focus-id={String(fault._id)}>
          <header>
            <strong>{formatDate(fault.violationDate)}</strong>
            <span>Ghi bởi {fault.recordedByName}</span>
          </header>
          <p>{fault.reason}</p>
          <PrivateFileButton kind="fault" fileId={fault._id} fileName={fault.fileName} />
        </article>
      ))}
    </div>
  );
}

function WorkKpiPanel({ workKpi }) {
  return (
    <div className="pr-kpi">
      <div className="pr-kpi-grid">
        <div><strong>{workKpi.total}</strong><span>Tổng việc</span></div>
        <div className="on-time"><strong>{workKpi.onTime}</strong><span>Đúng hạn</span></div>
        <div className="late"><strong>{workKpi.late}</strong><span>Trễ hạn</span></div>
        <div className="incomplete"><strong>{workKpi.incomplete}</strong><span>Chưa hoàn thành</span></div>
      </div>
      <div className="pr-task-list">
        {workKpi.tasks.length ? workKpi.tasks.map((task) => (
          <div className={`pr-task-row status-${task.status}`} key={task._id}>
            <div>
              <strong>{task.content}</strong>
              <small>Hạn {formatDate(task.deadline)}</small>
            </div>
            <span>
              {task.status === 'completed' ? 'Đúng hạn' : task.status === 'completed_late' ? 'Trễ hạn' : 'Chưa hoàn thành'}
              {task.qualityPercent != null ? ` · ${task.qualityPercent}%` : ''}
            </span>
          </div>
        )) : <div className="pr-empty">Không có công việc trong khoảng này.</div>}
      </div>
    </div>
  );
}

const TEXT_STATUS_LABELS = { pending: 'Chờ BGH duyệt', returned: 'Bị trả lại' };

/** "Chờ BGH duyệt" / "Bị trả lại" for comments văn thư wrote on behalf of BGH. */
export function TextStatusBadge({ status }) {
  if (!TEXT_STATUS_LABELS[status]) return null;
  return <span className={`pr-text-status is-${status}`}>{TEXT_STATUS_LABELS[status]}</span>;
}

function textAuthorLine(text) {
  if (text.status === 'approved' && text.writtenOnBehalf) {
    return `${text.reviewedByName || text.evaluatorName} duyệt — viết bởi Văn thư ${text.writerName}`;
  }
  if (text.writtenOnBehalf) return `Văn thư ${text.writerName} viết thay BGH`;
  return null;
}

/**
 * One "BGH đánh giá". Pending/returned ones only reach the writer, admin/mod and
 * eligible BGH approvers (server-filtered); every action is re-checked server-side.
 */
export function EvaluationTextCard({ text }) {
  const review = useMutation(anyApi.peopleReview.reviewEvaluationText);
  const resubmit = useMutation(anyApi.peopleReview.resubmitEvaluationText);
  const [mode, setMode] = useState('');
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState(text.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const authorLine = textAuthorLine(text);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setMode('');
      setReason('');
    } catch (actionError) {
      setError(messageFor(actionError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`pr-text-card is-${text.status}`} data-focus-id={String(text._id)}>
      <header>
        <span>{text.status === 'approved' ? text.evaluatorName : text.writerName}</span>
        <TextStatusBadge status={text.status} />
        <time>{formatDateTime(text.submittedAt || text.createdAt)}</time>
      </header>
      {authorLine ? <small className="pr-muted">{authorLine}</small> : null}
      {mode === 'edit' ? (
        <textarea rows={3} maxLength={5000} value={draft} onChange={(event) => setDraft(event.target.value)} />
      ) : (
        <p>{text.content}</p>
      )}
      {text.status === 'returned' && text.returnReason ? (
        <div className="pr-feedback error">
          {text.reviewedByName ? `${text.reviewedByName} trả lại` : 'Bị trả lại'}: {text.returnReason}
        </div>
      ) : null}
      {text.reviewBlockedAlreadyEvaluated ? (
        <small className="pr-muted">Bạn đã có BGH đánh giá cho kỳ này — một thành viên BGH khác sẽ duyệt.</small>
      ) : null}
      {mode === 'return' ? (
        <label className="pr-field-label">
          Lý do trả lại
          <textarea rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      ) : null}
      {error ? <div className="pr-feedback error">{error}</div> : null}
      {text.canReview || text.canEdit ? (
        <div className="pr-text-actions">
          {text.canReview && mode === '' ? (
            <>
              <button
                type="button"
                className="pr-mini-button primary"
                disabled={busy}
                onClick={() => void run(() => review({ textId: text._id, decision: 'approve', submittedAt: text.submittedAt }))}
              >
                Duyệt
              </button>
              <button type="button" className="pr-mini-button" disabled={busy} onClick={() => setMode('return')}>
                Trả lại
              </button>
            </>
          ) : null}
          {mode === 'return' ? (
            <>
              <button type="button" className="pr-mini-button" disabled={busy} onClick={() => setMode('')}>Hủy</button>
              <button
                type="button"
                className="pr-mini-button primary"
                disabled={busy || !reason.trim()}
                onClick={() => void run(() => review({
                  textId: text._id,
                  decision: 'return',
                  reason: reason.trim(),
                  submittedAt: text.submittedAt,
                }))}
              >
                Gửi trả lại
              </button>
            </>
          ) : null}
          {text.canEdit && mode === '' ? (
            <button
              type="button"
              className="pr-mini-button"
              disabled={busy}
              onClick={() => {
                setDraft(text.content);
                setMode('edit');
              }}
            >
              {text.status === 'returned' ? 'Sửa & gửi duyệt lại' : 'Sửa'}
            </button>
          ) : null}
          {mode === 'edit' ? (
            <>
              <button type="button" className="pr-mini-button" disabled={busy} onClick={() => setMode('')}>Hủy</button>
              <button
                type="button"
                className="pr-mini-button primary"
                disabled={busy || !draft.trim()}
                onClick={() => void run(() => resubmit({ textId: text._id, content: draft.trim() }))}
              >
                Gửi BGH duyệt
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/** "Nhận xét chờ BGH duyệt": BGH approve here; văn thư track and fix returned ones. */
function EvaluationReviewQueue() {
  const queue = useQuery(anyApi.peopleReview.evaluationReviewQueue, {});
  if (!queue?.items?.length) return null;
  return (
    <section className="pr-section pr-review-queue">
      <header className="pr-section-head">
        <h3>Nhận xét chờ BGH duyệt</h3>
        <p>BGH đánh giá do Văn thư viết thay chỉ có hiệu lực sau khi một thành viên Ban Giám hiệu duyệt.</p>
      </header>
      <div className="pr-text-list">
        {queue.items.map((item) => (
          <div className="pr-review-item" key={item._id}>
            <div className="pr-review-item-head">
              <strong>{item.targetName}</strong>
              <small>{item.departmentName} · {item.periodLabel}</small>
              <PrivateFileButton kind="evaluation" fileId={item.fileId} fileName={item.fileName} />
            </div>
            <EvaluationTextCard text={item} />
          </div>
        ))}
      </div>
    </section>
  );
}

function EvalBlock({ title, options, value, onChange, file }) {
  return (
    <section className="pr-eval-block">
      <header>
        <h4>{title}</h4>
        {options.length ? (
          <select value={value} onChange={(event) => onChange(event.target.value)}>
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : null}
      </header>
      {!file ? (
        <div className="pr-empty">Chưa có file đánh giá.</div>
      ) : (
        <div className="pr-eval-file">
          <PrivateFileButton kind="evaluation" fileId={file._id} fileName={file.fileName} />
          <small>
            Cập nhật {formatDateTime(file.lastUploadedAt)}
            {file.versionCount > 1 ? ` · Đã đổi ${file.versionCount - 1} lần` : ''}
            {file.uploadedByName ? ` · Upload bởi ${file.uploadedByName}` : ''}
          </small>
          {file.texts.length ? (
            <div className="pr-text-list">
              <strong>{file.texts.filter((text) => text.status === 'approved').length} BGH đánh giá</strong>
              {file.texts.map((text) => <EvaluationTextCard key={text._id} text={text} />)}
            </div>
          ) : (
            <small className="pr-muted">Chưa có BGH đánh giá.</small>
          )}
        </div>
      )}
    </section>
  );
}

function EvaluationViewer({ evaluations, boardingOptions }) {
  const quarterly = evaluations.filter((item) => item.kind === 'quarterly');
  const civil = evaluations.filter((item) => item.kind === 'civil_servant');
  const boarding = evaluations.filter((item) => item.kind === 'boarding');
  const [quarterKey, setQuarterKey] = useState(quarterly[0]?.periodKey || '');
  const [civilKey, setCivilKey] = useState(civil[0]?.periodKey || '');
  const [boardingKey, setBoardingKey] = useState(boarding[0]?.periodKey || '');
  const selectedQuarter = quarterly.find((item) => item.periodKey === quarterKey) || quarterly[0] || null;
  const selectedCivil = civil.find((item) => item.periodKey === civilKey) || civil[0] || null;
  const selectedBoarding = boarding.find((item) => item.periodKey === boardingKey) || boarding[0] || null;

  return (
    <div className="pr-eval-viewer">
      <EvalBlock
        title="Đánh giá theo quý"
        options={quarterly.map((item) => ({ value: item.periodKey, label: periodLabel(item) }))}
        value={selectedQuarter?.periodKey || ''}
        onChange={setQuarterKey}
        file={selectedQuarter}
      />
      <EvalBlock
        title="Đánh giá viên chức"
        options={civil.map((item) => ({ value: item.periodKey, label: periodLabel(item) }))}
        value={selectedCivil?.periodKey || ''}
        onChange={setCivilKey}
        file={selectedCivil}
      />
      {boardingOptions.length ? (
        <EvalBlock
          title="Đánh giá công tác bán trú"
          options={boarding.map((item) => ({ value: item.periodKey, label: periodLabel(item) }))}
          value={selectedBoarding?.periodKey || ''}
          onChange={setBoardingKey}
          file={selectedBoarding}
        />
      ) : null}
    </div>
  );
}

export function FaultModal({ person, onClose, onSaved }) {
  const { fetchAccessToken } = useConvexAuth();
  const recordFault = useMutation(anyApi.peopleReview.recordFault);
  const [violationDate, setViolationDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingSettlement, setPendingSettlement] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (pendingSettlement) {
      setSaving(true);
      setError('');
      try {
        await settleUploadedFile(fetchAccessToken, pendingSettlement.cleanupToken, true);
        setPendingSettlement(null);
        onSaved();
        onClose();
      } catch (settlementError) {
        console.error('Fault upload settlement retry failed', settlementError);
        setError('Lỗi đã được ghi nhận và tệp vẫn được giữ an toàn, nhưng chưa thể hoàn tất upload. Vui lòng thử lại.');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!file) return setError('Vui lòng đính kèm ảnh/PDF bằng chứng.');
    setSaving(true);
    setError('');
    let uploaded = null;
    let crmCommitted = false;
    try {
      uploaded = await uploadDriveFile(fetchAccessToken, file);
      await recordFault({
        targetUserId: person._id,
        violationDate,
        reason,
        driveFileId: uploaded.driveFileId,
        driveChecksum: uploaded.driveChecksum,
        cleanupToken: uploaded.cleanupToken,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      });
      crmCommitted = true;
      await settleUploadedFile(fetchAccessToken, uploaded.cleanupToken, true);
      onSaved();
      onClose();
    } catch (submitError) {
      if (crmCommitted) {
        setPendingSettlement(uploaded);
        console.error('Fault upload settlement failed after CRM commit', submitError);
        setError('Lỗi đã được ghi nhận và tệp vẫn được giữ an toàn, nhưng chưa thể hoàn tất upload. Vui lòng thử lại.');
      } else if (uploaded) {
        try {
          await settleUploadedFile(fetchAccessToken, uploaded.cleanupToken, false);
        } catch (cleanupError) {
          console.error('Fault upload cleanup failed', cleanupError);
        }
        setError('Không thể ghi nhận lỗi. Kiểm tra quyền và tệp đính kèm.');
      } else {
        setError('Không thể ghi nhận lỗi. Kiểm tra quyền và tệp đính kèm.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pr-modal-backdrop" role="presentation">
      <form className="pr-modal" onSubmit={submit}>
        <button type="button" className="pr-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="pr-kicker">Ghi nhận lỗi</span>
        <h3>{person.name}</h3>
        <label className="pr-field-label">Ngày vi phạm</label>
        <input type="date" value={violationDate} max={todayIso()} onChange={(event) => setViolationDate(event.target.value)} required />
        <label className="pr-field-label">Lý do</label>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={2000} required />
        <label className="pr-field-label">Ảnh / PDF bằng chứng</label>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(event) => {
            const next = event.target.files?.[0] || null;
            if (!next) return setFile(null);
            const ext = next.name.toLowerCase().split('.').pop();
            if (!ACCEPTED.includes(ext) || next.size > 20 * 1024 * 1024) {
              setError('Chỉ nhận PDF/PNG/JPG tối đa 20MB.');
              setFile(null);
              return;
            }
            setError('');
            setFile(next);
          }}
          required
        />
        {error ? <div className="pr-feedback error">{error}</div> : null}
        <div className="pr-modal-actions">
          <button type="button" className="pr-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="pr-primary-button" disabled={saving}>
            {saving ? 'Đang lưu…' : pendingSettlement ? 'Thử hoàn tất lại' : 'Ghi nhận'}
          </button>
        </div>
      </form>
    </div>
  );
}

function EvaluationModal({ person, boardingOptions, existingEvaluations, onClose, onSaved }) {
  const { fetchAccessToken } = useConvexAuth();
  const saveBatch = useMutation(anyApi.peopleReview.saveEvaluationBatch);
  const nowQ = currentQuarter();
  const [quarter, setQuarter] = useState(nowQ.quarter);
  const [year, setYear] = useState(nowQ.year);
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear());
  const [boardingKey, setBoardingKey] = useState(boardingOptions[0]?.periodKey || '');
  const [quarterFile, setQuarterFile] = useState(null);
  const [civilFile, setCivilFile] = useState(null);
  const [boardingFile, setBoardingFile] = useState(null);
  const [quarterText, setQuarterText] = useState('');
  const [civilText, setCivilText] = useState('');
  const [boardingText, setBoardingText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [pendingSettlement, setPendingSettlement] = useState(null);

  const findExisting = (kind, periodKey) =>
    existingEvaluations.find((item) => item.kind === kind && item.periodKey === periodKey) || null;

  const existingQuarter = findExisting('quarterly', `Q${quarter}-${year}`);
  const existingCivil = findExisting('civil_servant', `CS-${schoolYear}`);
  const existingBoarding = boardingKey ? findExisting('boarding', boardingKey) : null;

  const pickFile = (setter) => (event) => {
    const next = event.target.files?.[0] || null;
    if (!next) return setter(null);
    const ext = next.name.toLowerCase().split('.').pop();
    if (!ACCEPTED.includes(ext) || next.size > 20 * 1024 * 1024) {
      setError('Chỉ nhận PDF/PNG/JPG tối đa 20MB.');
      setter(null);
      return;
    }
    setError('');
    setter(next);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    if (pendingSettlement) {
      try {
        await Promise.all(pendingSettlement.uploadedFiles.map((uploaded) =>
          settleUploadedFile(fetchAccessToken, uploaded.cleanupToken, true)));
        await Promise.all(pendingSettlement.cleanupJobIds.map((cleanupJobId) =>
          runCleanupJob(fetchAccessToken, cleanupJobId)));
        setPendingSettlement(null);
        onSaved();
        onClose();
      } catch (settlementError) {
        console.error('People review evaluation settlement retry failed', settlementError);
        setError('Đánh giá đã được lưu và tệp vẫn được giữ an toàn, nhưng chưa thể hoàn tất upload. Vui lòng thử lại.');
      } finally {
        setSaving(false);
      }
      return;
    }
    const uploadedFiles = [];
    let crmCommitted = false;
    let cleanupJobIds = [];
    try {
      /** @type {Array<any>} */
      const jobs = [];
      if (quarterFile || quarterText.trim()) {
        jobs.push({
          kind: 'quarterly',
          file: quarterFile,
          text: quarterText,
          periodArgs: { year, quarter },
          existing: existingQuarter,
        });
      }
      if (civilFile || civilText.trim()) {
        jobs.push({
          kind: 'civil_servant',
          file: civilFile,
          text: civilText,
          periodArgs: { schoolYear },
          existing: existingCivil,
        });
      }
      if (boardingKey && (boardingFile || boardingText.trim())) {
        const option = boardingOptions.find((item) => item.periodKey === boardingKey);
        if (!option) throw new Error('INVALID_EVALUATION_PERIOD');
        jobs.push({
          kind: 'boarding',
          file: boardingFile,
          text: boardingText,
          periodArgs: { schoolYear: option.schoolYear, semester: option.semester },
          existing: existingBoarding,
        });
      }
      if (!jobs.length) {
        setError('Chọn ít nhất một mục để upload hoặc BGH đánh giá.');
        setSaving(false);
        return;
      }
      for (const job of jobs) {
        if (!job.file) continue;
        if (job.existing?.textLocked) throw new Error('EVALUATION_FILE_LOCKED');
        job.uploaded = await uploadDriveFile(fetchAccessToken, job.file);
        uploadedFiles.push(job.uploaded);
      }
      const result = await saveBatch({
        targetUserId: person._id,
        requestId,
        sections: jobs.map((job) => ({
          kind: job.kind,
          ...job.periodArgs,
          ...(job.text.trim() ? { content: job.text.trim() } : {}),
          ...(job.uploaded ? {
            upload: {
              driveFileId: job.uploaded.driveFileId,
              driveChecksum: job.uploaded.driveChecksum,
              cleanupToken: job.uploaded.cleanupToken,
              fileName: job.file.name,
              fileType: job.file.type || 'application/octet-stream',
              fileSize: job.file.size,
            },
          } : {}),
        })),
      });
      crmCommitted = true;
      cleanupJobIds = result.cleanupJobIds || [];
      await Promise.all(uploadedFiles.map((uploaded) =>
        settleUploadedFile(fetchAccessToken, uploaded.cleanupToken, true)));
      await Promise.all(cleanupJobIds.map((cleanupJobId) =>
        runCleanupJob(fetchAccessToken, cleanupJobId)));
      onSaved();
      onClose();
    } catch (err) {
      if (crmCommitted) {
        setPendingSettlement({ uploadedFiles, cleanupJobIds });
        console.error('People review evaluation settlement failed after CRM commit', err);
        setError('Đánh giá đã được lưu và tệp vẫn được giữ an toàn, nhưng chưa thể hoàn tất upload. Vui lòng thử lại.');
        return;
      }
      await Promise.allSettled(uploadedFiles.map((uploaded) =>
        settleUploadedFile(fetchAccessToken, uploaded.cleanupToken, false)));
      console.error('People review evaluation save failed', err);
      const message = String(err?.message || err?.data || err);
      if (message.includes('EVALUATION_FILE_LOCKED')) setError('File kỳ này đã có BGH đánh giá — không thể upload lại.');
      else if (message.includes('EVALUATION_FILE_REQUIRED')) setError('Cần có file upload trước khi ghi BGH đánh giá.');
      else if (message.includes('EVALUATION_TEXT_ALREADY_SUBMITTED')) setError('Bạn đã ghi BGH đánh giá cho kỳ này rồi.');
      else if (message.includes('PEOPLE_REVIEW_UPLOAD_FORBIDDEN')) setError('Bạn không có quyền upload file đánh giá cho người này.');
      else if (message.includes('BOARDING_NOT_PARTICIPATING')) setError('Giáo viên không tham gia bán trú kỳ này.');
      else if (message.includes('INVALID_FILE') || message.includes('UPLOAD_FAILED')) setError('Không upload được tệp. Chỉ nhận PDF/PNG/JPG tối đa 20MB.');
      else if (message.includes('AUTH_REQUIRED') || message.includes('UNAUTHORIZED')) setError('Phiên đăng nhập hết hạn. Vui lòng tải lại trang và đăng nhập lại.');
      else if (message.includes('INVALID_EVALUATION_PERIOD')) setError('Kỳ đánh giá không hợp lệ. Chọn lại quý/năm học/học kỳ.');
      else setError(`Không thể lưu đánh giá: ${message.replace(/^.*Uncaught Error:\s*/i, '').slice(0, 180)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pr-modal-backdrop" role="presentation">
      <form className="pr-modal pr-modal-wide" onSubmit={submit}>
        <button type="button" className="pr-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="pr-kicker">Thêm đánh giá</span>
        <h3>{person.name}</h3>
        <p className="pr-modal-context">{person.departmentName}</p>

        <section className="pr-form-section">
          <header>
            <h4>Đánh giá theo quý</h4>
            <div className="pr-inline-fields">
              <label>
                Quý
                <select value={quarter} onChange={(event) => setQuarter(Number(event.target.value))}>
                  {[1, 2, 3, 4].map((value) => <option key={value} value={value}>Quý {value}</option>)}
                </select>
              </label>
              <label>
                Năm
                <input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} />
              </label>
            </div>
          </header>
          {existingQuarter ? (
            <div className="pr-existing-file">
              <PrivateFileButton kind="evaluation" fileId={existingQuarter._id} fileName={existingQuarter.fileName} />
              <small>{existingQuarter.textLocked ? 'Đã khóa upload' : `Version ${existingQuarter.versionCount}`}</small>
              {existingQuarter.texts.map((text) => (
                <article className="pr-mini-text" key={text._id}>
                  <strong>{text.evaluatorName}</strong>
                  <span>{formatDateTime(text.createdAt)}</span>
                  <TextStatusBadge status={text.status} />
                  <p>{text.content}</p>
                </article>
              ))}
            </div>
          ) : null}
          {person.canUpload && !existingQuarter?.textLocked ? (
            <label className="pr-field-label">Upload file<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={pickFile(setQuarterFile)} /></label>
          ) : null}
          {person.canWriteText ? (
            <label className="pr-field-label">
              BGH đánh giá
              <textarea rows={3} value={quarterText} onChange={(event) => setQuarterText(event.target.value)} disabled={!existingQuarter && !quarterFile} />
            </label>
          ) : null}
        </section>

        <section className="pr-form-section">
          <header>
            <h4>Đánh giá viên chức</h4>
            <label>
              Năm học
              <input type="text" value={schoolYear} onChange={(event) => setSchoolYear(event.target.value)} placeholder="2025-2026" />
            </label>
          </header>
          {existingCivil ? (
            <div className="pr-existing-file">
              <PrivateFileButton kind="evaluation" fileId={existingCivil._id} fileName={existingCivil.fileName} />
              <small>{existingCivil.textLocked ? 'Đã khóa upload' : `Version ${existingCivil.versionCount}`}</small>
              {existingCivil.texts.map((text) => (
                <article className="pr-mini-text" key={text._id}>
                  <strong>{text.evaluatorName}</strong>
                  <span>{formatDateTime(text.createdAt)}</span>
                  <TextStatusBadge status={text.status} />
                  <p>{text.content}</p>
                </article>
              ))}
            </div>
          ) : null}
          {person.canUpload && !existingCivil?.textLocked ? (
            <label className="pr-field-label">Upload file<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={pickFile(setCivilFile)} /></label>
          ) : null}
          {person.canWriteText ? (
            <label className="pr-field-label">
              BGH đánh giá
              <textarea rows={3} value={civilText} onChange={(event) => setCivilText(event.target.value)} disabled={!existingCivil && !civilFile} />
            </label>
          ) : null}
        </section>

        {boardingOptions.length ? (
          <section className="pr-form-section">
            <header>
              <h4>Đánh giá công tác bán trú</h4>
              <label>
                Học kỳ
                <select value={boardingKey} onChange={(event) => setBoardingKey(event.target.value)}>
                  {boardingOptions.map((option) => (
                    <option key={option.periodKey} value={option.periodKey}>{option.label}</option>
                  ))}
                </select>
              </label>
            </header>
            {existingBoarding ? (
              <div className="pr-existing-file">
                <PrivateFileButton kind="evaluation" fileId={existingBoarding._id} fileName={existingBoarding.fileName} />
                <small>{existingBoarding.textLocked ? 'Đã khóa upload' : `Version ${existingBoarding.versionCount}`}</small>
                {existingBoarding.texts.map((text) => (
                  <article className="pr-mini-text" key={text._id}>
                    <strong>{text.evaluatorName}</strong>
                    <span>{formatDateTime(text.createdAt)}</span>
                    <TextStatusBadge status={text.status} />
                    <p>{text.content}</p>
                  </article>
                ))}
              </div>
            ) : null}
            {person.canUpload && !existingBoarding?.textLocked ? (
              <label className="pr-field-label">Upload file<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={pickFile(setBoardingFile)} /></label>
            ) : null}
            {person.canWriteText ? (
              <label className="pr-field-label">
                BGH đánh giá
                <textarea rows={3} value={boardingText} onChange={(event) => setBoardingText(event.target.value)} disabled={!existingBoarding && !boardingFile} />
              </label>
            ) : null}
          </section>
        ) : null}

        {error ? <div className="pr-feedback error">{error}</div> : null}
        <div className="pr-modal-actions">
          <button type="button" className="pr-ghost-button" onClick={onClose}>Hủy</button>
          <button type="submit" className="pr-primary-button" disabled={saving}>
            {saving ? 'Đang lưu…' : pendingSettlement ? 'Thử hoàn tất lại' : 'Lưu'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PersonDashboard({ userId, permissions, showActions }) {
  const defaultTo = todayIso();
  const defaultFrom = addDays(defaultTo, -29);
  const [faultRange, setFaultRange] = useState({ from: defaultFrom, to: defaultTo });
  const [workRange, setWorkRange] = useState({ from: defaultFrom, to: defaultTo });
  const [evalOpen, setEvalOpen] = useState(false);
  const data = useQuery(anyApi.peopleReview.personDetail, {
    userId,
    faultFrom: faultRange.from,
    faultTo: faultRange.to,
    workFrom: workRange.from,
    workTo: workRange.to,
  });

  if (data === undefined) return <div className="pr-loading">Đang tải hồ sơ…</div>;

  const person = {
    ...data.person,
    canUpload: permissions?.canUpload ?? data.permissions.canUpload,
    canWriteText: permissions?.canWriteText ?? data.permissions.canWriteText,
    canRecordFault: permissions?.canRecordFault ?? data.permissions.canRecordFault,
  };

  return (
    <div className="pr-person-dashboard">
      {showActions && (person.canUpload || person.canWriteText) ? (
        <div className="pr-person-actions">
          <button type="button" className="pr-primary-button" onClick={() => setEvalOpen(true)}>＋ Thêm đánh giá</button>
        </div>
      ) : null}

      <section className="pr-section pr-section--faults">
        <header className="pr-section-head">
          <h3>Ghi nhận lỗi</h3>
          <p>Các lần vi phạm đã ghi</p>
        </header>
        <DateRangeFilter from={faultRange.from} to={faultRange.to} onChange={setFaultRange} label="Lọc lỗi" />
        <FaultList faults={data.faults} />
      </section>

      <section className="pr-section pr-section--work">
        <header className="pr-section-head">
          <h3>Công việc</h3>
          <p>Mức độ hoàn thành</p>
        </header>
        <DateRangeFilter from={workRange.from} to={workRange.to} onChange={setWorkRange} label="Lọc công việc" />
        <WorkKpiPanel workKpi={data.workKpi} />
      </section>

      <section className="pr-section pr-section--eval">
        <header className="pr-section-head">
          <h3>Kỳ đánh giá</h3>
          <p>File và nhận xét theo từng kỳ</p>
        </header>
        <EvaluationViewer evaluations={data.evaluations} boardingOptions={data.boardingOptions} />
      </section>

      {evalOpen ? (
        <EvaluationModal
          person={person}
          boardingOptions={data.boardingOptions}
          existingEvaluations={data.evaluations}
          onClose={() => setEvalOpen(false)}
          onSaved={() => {}}
        />
      ) : null}
    </div>
  );
}

function EvalTargetModal({ person, onClose }) {
  const detail = useQuery(anyApi.peopleReview.personDetail, { userId: person._id });
  if (detail === undefined) {
    return (
      <div className="pr-modal-backdrop">
        <div className="pr-modal"><div className="pr-loading">Đang tải…</div></div>
      </div>
    );
  }
  return (
    <EvaluationModal
      person={{ ...person, departmentName: detail.person.departmentName }}
      boardingOptions={detail.boardingOptions}
      existingEvaluations={detail.evaluations}
      onClose={onClose}
      onSaved={onClose}
    />
  );
}

export default function PeopleReviewView({ focusTarget = null }) {
  const overview = useQuery(anyApi.peopleReview.overview);
  const [selectedId, setSelectedId] = useState('');
  const [evalTarget, setEvalTarget] = useState(null);
  // Bell items: a fault opens "Hồ sơ của tôi"; review items land on the queue panel.
  useNotificationFocus(focusTarget, {
    acceptSourceTypes: PEOPLE_NOTIFICATION_FOCUS_TYPES,
    onMatch: (target) => {
      if (target.sourceType === 'staff_fault') setSelectedId('');
    },
  });

  const groups = useMemo(() => {
    if (!overview?.people?.length) return [];
    const map = new Map();
    for (const person of overview.people) {
      const key = person.departmentName || 'Chưa xác định phòng ban';
      const list = map.get(key) || [];
      list.push(person);
      map.set(key, list);
    }
    return [...map.entries()].map(([departmentName, people]) => ({ departmentName, people }));
  }, [overview]);

  if (overview === undefined) return <div className="pr-loading">Đang tải đánh giá nhân sự…</div>;

  const selected = overview.people.find((person) => String(person._id) === String(selectedId)) || null;
  const isSelfMode = overview.mode === 'self';

  return (
    <section className="pr-view">
      {isSelfMode ? null : <EvaluationReviewQueue />}
      {isSelfMode ? (
        <PersonDashboard
          userId={overview.self._id}
          showActions
          permissions={{
            canUpload: overview.actor.canSelfUpload,
            canWriteText: false,
            canRecordFault: overview.actor.canSelfFault,
          }}
        />
      ) : (
        <div className="pr-layout">
          <aside className="pr-people-panel">
            <div className="pr-people-self">
              <button type="button" className={!selectedId ? 'is-active' : ''} onClick={() => setSelectedId('')}>
                <strong>{overview.self.name}</strong>
                <small>Hồ sơ của tôi</small>
              </button>
            </div>
            {groups.map((group) => (
              <div className="pr-dept-group" key={group.departmentName}>
                <h4>{group.departmentName}</h4>
                {group.people.map((person) => (
                  <div className={`pr-person-row ${String(selectedId) === String(person._id) ? 'is-active' : ''}`} key={person._id}>
                    <button type="button" className="pr-person-main" onClick={() => setSelectedId(person._id)}>
                      <strong>{person.name}</strong>
                      <small>
                        {person.isOps
                          ? person.positionName
                          : `${person.positionLevel || '—'}★ · ${person.positionName}`}
                      </small>
                    </button>
                    <div className="pr-row-actions">
                      {person.canUpload || person.canWriteText ? (
                        <button type="button" className="pr-mini-button primary" onClick={() => setEvalTarget(person)} title="Thêm đánh giá">Đánh giá</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </aside>
          <div className="pr-detail-panel">
            {selected ? (
              <PersonDashboard
                userId={selected._id}
                showActions={false}
                permissions={{
                  canUpload: selected.canUpload,
                  canWriteText: selected.canWriteText,
                  canRecordFault: selected.canRecordFault,
                }}
              />
            ) : (
              <PersonDashboard
                userId={overview.self._id}
                showActions
                permissions={{
                  canUpload: overview.actor.canSelfUpload,
                  canWriteText: false,
                  canRecordFault: overview.actor.canSelfFault,
                }}
              />
            )}
          </div>
        </div>
      )}

      {evalTarget ? <EvalTargetModal person={evalTarget} onClose={() => setEvalTarget(null)} /> : null}
    </section>
  );
}
