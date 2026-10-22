import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAction, useConvex, useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { messageFor } from '../lib/appErrorMessage';
import { downloadSupervisorTemplate } from '../lib/supervisorAttendanceExcel';
import { vietnamTodayYmd } from '../homeroom/homeroomTime';
import { formatDate, formatDateLong, schoolDayLabel } from '../homeroom/homeroomLabels';
import { DateStepper, EmptyState, Feedback, Icon, Loading, Notice } from '../homeroom/homeroomUi';
import {
  absentIdsOf,
  classesForGrade,
  classStatusText,
  GRADE_TABS,
  latestSaved,
  precheckImportFile,
  readStoredGrade,
  sameIdSet,
  toggleId,
  writeStoredGrade,
} from './attendanceState';
import '../homeroom/homeroom.css';
import './attendance.css';

const UNSAVED_PROMPT = 'Lớp đang mở có thay đổi chưa lưu. Bỏ các thay đổi này?';

/**
 * Điểm danh (Giám thị): chọn khối → mở lớp → tick "Vắng" → Lưu lớp. Mặc định cả lớp có mặt.
 * Backend (convex/supervisorAttendance.ts) kiểm tra lại quyền và ngày ở mọi thao tác.
 */
export default function AttendancePage() {
  const today = vietnamTodayYmd();
  const [date, setDate] = useState(today);
  const [grade, setGrade] = useState(() => readStoredGrade());
  const [openClassId, setOpenClassId] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const dirtyRef = useRef(false);
  const setDirty = useCallback((dirty) => {
    dirtyRef.current = dirty;
  }, []);
  const convex = useConvex();
  // Class list + saved markers only; students load per class when a class is opened.
  const roster = useQuery(anyApi.supervisorAttendance.rosterSummary, { date });

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  /** Runs `action` only if the open class has no unsaved changes, or the user agrees to drop them. */
  const guard = (action) => {
    if (dirtyRef.current && !window.confirm(UNSAVED_PROMPT)) return;
    dirtyRef.current = false;
    action();
  };

  const chooseGrade = (next) =>
    guard(() => {
      setGrade(next);
      setOpenClassId('');
      writeStoredGrade(next);
    });

  const chooseDate = (next) =>
    guard(() => {
      setDate(next);
      setOpenClassId('');
    });

  const toggleClass = (classId) => guard(() => setOpenClassId((current) => (current === classId ? '' : classId)));

  const downloadTemplate = async () => {
    setTemplateBusy(true);
    setPageError('');
    try {
      const result = await convex.query(anyApi.supervisorAttendance.templateRows, { date });
      if (!result.rows.length) {
        setPageError('Chưa có lớp hoặc học sinh nào trong năm học để tạo file mẫu.');
        return;
      }
      downloadSupervisorTemplate(result.rows, result.date);
    } catch (err) {
      setPageError(messageFor(err));
    } finally {
      setTemplateBusy(false);
    }
  };

  const classes = classesForGrade(roster, grade);

  return (
    <section className="homeroom-view att-view" aria-labelledby="att-title">
      <header className="hr-panel att-head">
        <div className="att-head-main">
          <span className="hr-eyebrow">Giám thị</span>
          <h1 id="att-title">Điểm danh</h1>
          <p className="hr-muted">
            {formatDateLong(date)}
            {roster?.schoolYear ? ` · Năm học ${roster.schoolYear.name}` : ''}
          </p>
        </div>
        <div className="att-head-actions">
          <button type="button" className="hr-button" disabled={templateBusy || !roster?.schoolYear} onClick={() => void downloadTemplate()}>
            <Icon name="download" size={15} /> {templateBusy ? 'Đang tạo file…' : 'Tải file mẫu'}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!roster?.schoolYear}
            aria-expanded={importOpen}
            onClick={() => guard(() => setImportOpen((value) => !value))}
          >
            <Icon name="upload" size={15} /> Import Excel
          </button>
        </div>
        {roster?.canChooseDate ? (
          <div className="att-date">
            <DateStepper value={date} onChange={chooseDate} max={today} label="Ngày điểm danh" />
            {date !== today ? (
              <button type="button" className="hr-button hr-button--ghost" onClick={() => chooseDate(today)}>Về hôm nay</button>
            ) : null}
          </div>
        ) : null}
      </header>

      <Feedback error={pageError} />

      {importOpen ? (
        <ImportPanel
          date={date}
          onClose={() => setImportOpen(false)}
          onDone={() => setOpenClassId('')}
        />
      ) : null}

      {roster === undefined ? (
        <Loading label="Đang tải danh sách lớp…" />
      ) : !roster.schoolYear ? (
        <div className="hr-panel">
          <EmptyState icon="calendar" title={`Ngày ${formatDate(date)} không thuộc năm học nào.`}>
            Quản trị viên tạo năm học trong Thiết lập tối cao › Thiết lập năm học.
          </EmptyState>
        </div>
      ) : (
        <>
          {!roster.schoolDay?.isSchoolDay ? (
            <Notice tone="info" icon="calendar" title={`${schoolDayLabel(roster.schoolDay)} — vẫn có thể lưu điểm danh nếu cần.`}>
              {roster.schoolDay?.note || 'Theo lịch, hôm nay không phải ngày học.'}
            </Notice>
          ) : null}

          <div className="hr-tabs att-grade-tabs" role="tablist" aria-label="Chọn khối">
            {GRADE_TABS.map((value) => {
              const list = classesForGrade(roster, value);
              const done = list.filter((row) => row.saved).length;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={grade === value}
                  aria-current={grade === value ? 'page' : undefined}
                  onClick={() => chooseGrade(value)}
                >
                  Lớp {value}
                  <span className="att-tab-count">{done}/{list.length}</span>
                </button>
              );
            })}
          </div>

          {!classes.length ? (
            <div className="hr-panel">
              <EmptyState icon="classes" title={`Chưa có lớp khối ${grade} đang hoạt động.`} />
            </div>
          ) : (
            <ul className="att-class-list">
              {classes.map((klass) => (
                <ClassRow
                  key={klass.classId}
                  klass={klass}
                  date={date}
                  open={openClassId === klass.classId}
                  onToggle={() => toggleClass(klass.classId)}
                  onDirtyChange={setDirty}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function ClassRow({ klass, date, open, onToggle, onDirtyChange }) {
  const panelId = `att-class-${klass.classId}`;
  // Kept here (not in the editor) so it survives the editor reloading after a save.
  const [localSaved, setLocalSaved] = useState(null);
  const [notice, setNotice] = useState(null);
  const saved = latestSaved(klass.saved, localSaved, date);

  useEffect(() => {
    if (!open) setNotice(null);
  }, [open]);

  return (
    <li className={`att-class${open ? ' is-open' : ''}`}>
      <button type="button" className="att-class-head" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="att-class-name">
          <strong>Lớp {klass.name}</strong>
          <span className="hr-sub">Sĩ số {klass.rosterCount}</span>
        </span>
        <span className={`att-status ${saved ? 'is-saved' : 'is-pending'}`}>
          <Icon name={saved ? 'check' : 'clock'} size={14} />
          {classStatusText(saved)}
        </span>
        <span className="att-chevron" aria-hidden="true"><Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} /></span>
      </button>
      {open ? (
        <div id={panelId} className="att-class-body">
          <ClassEditor
            klass={klass}
            date={date}
            onDirtyChange={onDirtyChange}
            notice={notice && notice.date === date ? notice.text : ''}
            onEdited={() => setNotice(null)}
            onSaved={(result) => {
              setLocalSaved({ date, savedAt: result.savedAt, absentCount: result.absentCount, presentCount: result.presentCount });
              setNotice({ date, text: `Đã lưu lớp ${klass.name}: ${result.absentCount} vắng, ${result.presentCount} có mặt.` });
            }}
          />
        </div>
      ) : null}
    </li>
  );
}

function ClassEditor({ klass, date, onDirtyChange, notice, onEdited, onSaved }) {
  const data = useQuery(anyApi.supervisorAttendance.classRoster, { date, classId: klass.classId });
  if (data === undefined) return <Loading label="Đang tải danh sách học sinh…" />;
  if (!data.students.length) return <p className="hr-muted">Lớp chưa có học sinh vào ngày này.</p>;
  return (
    <ClassEditorForm
      key={`${klass.classId}|${date}|${data.saved?.savedAt || 0}`}
      klass={klass}
      students={data.students}
      date={date}
      onDirtyChange={onDirtyChange}
      notice={notice}
      onEdited={onEdited}
      onSaved={onSaved}
    />
  );
}

function ClassEditorForm({ klass, students, date, onDirtyChange, notice, onEdited, onSaved }) {
  const saveClass = useMutation(anyApi.supervisorAttendance.saveClass);
  const initial = useMemo(() => absentIdsOf(students), [students]);
  const [absent, setAbsent] = useState(initial);
  // After a save the saved set is the baseline until the class roster reloads.
  const [baseline, setBaseline] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = !sameIdSet(absent, baseline);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const savedSet = new Set(absent);
      const result = await saveClass({ date, classId: klass.classId, absentStudentIds: [...savedSet] });
      setBaseline(savedSet);
      onDirtyChange(false);
      onSaved(result);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ol className="att-students">
        {students.map((student, index) => {
          const isAbsent = absent.has(student.studentId);
          const inputId = `att-${klass.classId}-${student.studentId}`;
          return (
            <li key={student.studentId} className={isAbsent ? 'is-absent' : ''}>
              <label htmlFor={inputId} className="att-student">
                <span className="att-student-name">
                  <span className="att-student-no">{student.rosterNumber || index + 1}.</span> {student.fullName}
                </span>
                <span className="att-absent-toggle">
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={isAbsent}
                    disabled={busy}
                    onChange={() => {
                      onEdited();
                      setAbsent((current) => toggleId(current, student.studentId));
                    }}
                  />
                  Vắng
                </span>
              </label>
            </li>
          );
        })}
      </ol>
      <Feedback error={error} />
      <div className="att-savebar">
        {notice && !dirty ? (
          <p className="att-savebar-note" role="status">
            <Icon name="check" size={15} /> {notice}
          </p>
        ) : null}
        <span className="att-savebar-count">
          <strong>{absent.size}</strong> vắng · {students.length - absent.size} có mặt
          {dirty ? <em> · chưa lưu</em> : null}
        </span>
        <button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>
          {busy ? 'Đang lưu…' : `Lưu lớp ${klass.name} (${absent.size} vắng)`}
        </button>
      </div>
    </>
  );
}

function ImportPanel({ date, onClose, onDone }) {
  const generateUploadUrl = useMutation(anyApi.supervisorAttendance.generateUploadUrl);
  const registerUpload = useMutation(anyApi.supervisorAttendance.registerUpload);
  const validateUpload = useAction(anyApi.supervisorAttendance.validate);
  const commitUpload = useAction(anyApi.supervisorAttendance.commit);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [uploadId, setUploadId] = useState('');
  const [result, setResult] = useState(null);
  const busy = Boolean(phase);

  const onFile = async (file) => {
    setError('');
    setPreview(null);
    setResult(null);
    setUploadId('');
    const problem = precheckImportFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setPhase('Đang tải file lên…');
      const uploadUrl = await generateUploadUrl({});
      const uploaded = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        body: file,
      });
      if (!uploaded.ok) throw new Error('IMPORT_UPLOAD_NOT_FOUND');
      const { storageId } = await uploaded.json();
      const registered = await registerUpload({ storageId, fileName: file.name, fileSize: file.size, date });
      setUploadId(registered.uploadId);
      setPhase('Đang kiểm tra file…');
      setPreview(await validateUpload({ uploadId: registered.uploadId }));
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setPhase('');
    }
  };

  const commit = async () => {
    setError('');
    setPhase('Đang lưu điểm danh…');
    try {
      const committed = await commitUpload({ uploadId });
      setResult(committed);
      setPreview(null);
      onDone();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setPhase('');
    }
  };

  return (
    <section className="hr-panel att-import" aria-labelledby="att-import-title">
      <header className="hr-panel-head">
        <div>
          <h2 id="att-import-title">Import Excel ngày {formatDate(date)}</h2>
          <p className="hr-muted">File 3 cột: Lớp học, Tên học sinh, Vắng (ghi x nếu vắng). Lớp không có trong file giữ nguyên.</p>
        </div>
        <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={busy}>Đóng</button>
      </header>

      <label className="att-file">
        <span>Chọn file Excel (.xlsx, tối đa 2 MB)</span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void onFile(file);
          }}
        />
      </label>
      {phase ? <Loading label={phase} /> : null}
      <Feedback error={error} success={result ? `Đã lưu điểm danh ${result.classCount} lớp (${result.absentCount} học sinh vắng).` : ''} />

      {preview && !preview.ok ? (
        <div className="att-preview">
          <Notice tone="danger" icon="alert" title={`File có ${preview.errors.length}${preview.errorsTruncated ? '+' : ''} lỗi — chưa lưu gì.`}>
            Sửa các dòng dưới đây rồi chọn lại file.
          </Notice>
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr><th className="is-num">Dòng</th><th>Lỗi</th></tr>
              </thead>
              <tbody>
                {preview.errors.map((item, index) => (
                  <tr key={`${item.rowNumber}-${index}`}>
                    <td className="is-num">{item.rowNumber || '—'}</td>
                    <td>{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {preview && preview.ok ? (
        <div className="att-preview">
          <p className="hr-lead">
            {preview.totalRows} dòng hợp lệ · {preview.classes.length} lớp sẽ được lưu. Học sinh có trong lớp nhưng không có trong file được tính là có mặt.
          </p>
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Lớp</th>
                  <th className="is-num">Sĩ số</th>
                  <th className="is-num">Vắng</th>
                  <th>Học sinh vắng</th>
                </tr>
              </thead>
              <tbody>
                {preview.classes.map((row) => (
                  <tr key={row.classId}>
                    <th scope="row">{row.name}</th>
                    <td className="is-num">{row.rosterCount}</td>
                    <td className="is-num">{row.absentCount}</td>
                    <td>{row.absentNames.join(', ') || <span className="hr-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="att-import-actions">
            <button type="button" className="primary-button" disabled={busy} onClick={() => void commit()}>
              {busy ? 'Đang lưu…' : 'Xác nhận lưu'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
