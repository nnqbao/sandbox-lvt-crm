import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { classLabel, formatDate, formatDateTime } from '../homeroom/homeroomLabels';
import { EmptyState, Feedback, Icon, Loading, Modal, Notice, useAsyncTask } from '../homeroom/homeroomUi';
import { formatScore, semesterForDate, vietnamNowParts } from '../lib/teachingSchedule';
import { GradeClassPicker } from './teachingShared';
import './teaching.css';

/** Học bạ › lớp mình dạy / chủ nhiệm trong năm học. */
export function GradebookClasses({ yearId, nav }) {
  const data = useQuery(anyApi.gradebook.myClasses, { schoolYearId: yearId });
  const catalog = useQuery(anyApi.teachingCatalog.catalog, {});
  const subjectNames = useMemo(() => new Map((catalog?.subjects || []).map((row) => [row._id, row.name])), [catalog]);
  if (data === undefined) return <Loading label="Đang tải lớp…" />;
  if (!data.classes.length) {
    return (
      <EmptyState icon="classes" title="Bạn chưa phụ trách lớp nào trong năm học này.">
        Học bạ hiện các lớp bạn được xếp lịch dạy hoặc làm giáo viên chủ nhiệm.
      </EmptyState>
    );
  }
  return (
    <div className="hr-stack">
      <p className="hr-muted">Chọn lớp rồi chọn học sinh để xem và nhập điểm. Bạn nhập điểm cho môn mình dạy ở lớp đó.</p>
      <GradeClassPicker
        classes={data.classes}
        defaultOpen={[6, 7, 8, 9]}
        renderMeta={(row) => {
          const parts = [];
          if (row.isHomeroom) parts.push('Chủ nhiệm');
          if (row.subjectIds.length) parts.push(row.subjectIds.map((id) => subjectNames.get(id) || 'Môn').join(', '));
          return parts.join(' · ') || `${row.rosterCount} HS`;
        }}
        onOpen={(row) => nav.gradebookClass(row._id)}
      />
    </div>
  );
}

export function GradebookClass({ classId, nav }) {
  const data = useQuery(anyApi.gradebook.classStudents, { classId });
  if (data === undefined) return <Loading label="Đang tải học sinh…" />;
  return (
    <div className="hr-stack">
      <button type="button" className="hr-back" onClick={nav.back}>
        <Icon name="arrowLeft" size={15} /> Học bạ
      </button>
      <header className="tc-page-head">
        <div>
          <span className="hr-eyebrow">Học bạ · Năm học {data.year.name}</span>
          <h2>{classLabel(data.class.name)}</h2>
          <p className="hr-muted">{data.students.length} học sinh. Bấm vào học sinh để xem điểm.</p>
        </div>
      </header>
      {!data.students.length ? (
        <EmptyState icon="users" title="Lớp chưa có học sinh." />
      ) : (
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th scope="col" className="is-num">STT</th>
                <th scope="col">Họ và tên</th>
                <th scope="col">Mã học sinh</th>
                <th scope="col">Ngày sinh</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((row, index) => (
                <tr key={row._id} className="is-clickable" onClick={() => nav.gradebookStudent(row._id)}>
                  <td className="is-num">{row.rosterNumber ?? index + 1}</td>
                  <th scope="row">
                    <button type="button" className="hr-link" onClick={(event) => { event.stopPropagation(); nav.gradebookStudent(row._id); }}>
                      {row.fullName}
                    </button>
                  </th>
                  <td>{row.studentCode}</td>
                  <td>{row.dateOfBirth ? formatDate(row.dateOfBirth) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Học bạ của một học sinh qua các khối 6–9: điểm, ĐTB môn học kỳ, ĐTB học kỳ, ĐTB năm. */
export function StudentGradebook({ studentId, nav }) {
  const [yearId, setYearId] = useState('');
  const data = useQuery(anyApi.gradebook.studentRecord, yearId ? { studentId, schoolYearId: yearId } : { studentId });
  const [modal, setModal] = useState(null);
  if (data === undefined) return <Loading label="Đang tải học bạ…" />;
  const subjectNames = new Map(data.subjects.map((row) => [row._id, row.name]));
  const selected = data.years.find((row) => row._id === data.selectedYearId);
  const summaries = new Map(data.yearSummaries.map((row) => [row.schoolYearId, row]));
  const bySubject = new Map(data.summary.subjects.map((row) => [row.subjectId, row]));
  const entriesFor = (subjectId, semester) => data.entries.filter((row) => row.subjectId === subjectId && row.semester === semester);

  return (
    <div className="hr-stack">
      <button type="button" className="hr-back" onClick={nav.back}>
        <Icon name="arrowLeft" size={15} /> Danh sách học sinh
      </button>
      <header className="tc-page-head">
        <div>
          <span className="hr-eyebrow">Học bạ</span>
          <h2>{data.student.fullName}</h2>
          <p className="hr-muted">
            Mã HS {data.student.studentCode}
            {data.student.dateOfBirth ? ` · Ngày sinh ${formatDate(data.student.dateOfBirth)}` : ''}
            {selected ? ` · ${classLabel(selected.className)} · Năm học ${selected.name}` : ''}
          </p>
        </div>
        {data.writableSubjectIds.length && data.testTypes.length ? (
          <button type="button" className="primary-button" onClick={() => setModal({ kind: 'add' })}>
            <Icon name="plus" size={15} /> Thêm điểm
          </button>
        ) : null}
      </header>

      <div className="tc-year-tabs" role="group" aria-label="Năm học">
        {data.years.map((year) => {
          const summary = summaries.get(year._id);
          return (
            <button
              key={year._id}
              type="button"
              className="tc-year-tab"
              aria-pressed={year._id === data.selectedYearId}
              onClick={() => setYearId(year._id)}
            >
              <strong>Khối {year.gradeLevel || '—'} · {year.className || 'Lớp'}</strong>
              <span>Năm học {year.name}</span>
              <span>ĐTB năm: {formatScore(summary?.year)}</span>
            </button>
          );
        })}
      </div>

      {!data.fullView ? (
        <Notice tone="info" icon="eye" title="Bạn đang xem các môn mình dạy học sinh này." />
      ) : null}
      {selected?.locked ? <Notice tone="warn" icon="alert" title="Năm học đã khóa — chỉ xem điểm." /> : null}
      {!data.testTypes.length && data.writableSubjectIds.length ? (
        <Notice tone="warn" icon="alert" title="Chưa có Loại kiểm tra.">Quản trị viên thêm tại Thiết lập loại kiểm tra.</Notice>
      ) : null}

      {!data.subjectIds.length ? (
        <EmptyState icon="file" title="Chưa có môn học nào trong năm học này.">
          Môn học hiện theo Lịch dạy của lớp hoặc khi đã có điểm.
        </EmptyState>
      ) : (
        <div className="hr-table-wrap">
          <table className="hr-table tc-grade-table">
            <thead>
              <tr>
                <th scope="col">Môn học</th>
                <th scope="col">Điểm học kỳ I</th>
                <th scope="col" className="is-num">ĐTB HK I</th>
                <th scope="col">Điểm học kỳ II</th>
                <th scope="col" className="is-num">ĐTB HK II</th>
                <th scope="col" className="is-num">Cả năm</th>
              </tr>
            </thead>
            <tbody>
              {data.subjectIds.map((subjectId) => {
                const summary = bySubject.get(subjectId);
                return (
                  <tr key={subjectId}>
                    <th scope="row">{subjectNames.get(subjectId) || 'Môn học'}</th>
                    {[1, 2].flatMap((semester) => [
                      <td key={`s${semester}`}>
                        <ScoreChips entries={entriesFor(subjectId, semester)} onEdit={(entry) => setModal({ kind: 'edit', entry })} />
                      </td>,
                      <td key={`a${semester}`} className="is-num">
                        <Avg value={semester === 1 ? summary?.semester1 : summary?.semester2} />
                      </td>,
                    ])}
                    <td className="is-num"><Avg value={summary?.year} /></td>
                  </tr>
                );
              })}
              <tr className="tc-grade-total">
                <th scope="row">ĐTB các môn</th>
                <td />
                <td className="is-num"><Avg value={data.summary.semester1} /></td>
                <td />
                <td className="is-num"><Avg value={data.summary.semester2} /></td>
                <td className="is-num"><Avg value={data.summary.year} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="hr-hint">
        <Icon name="chart" size={14} /> ĐTB môn học kỳ = tổng (điểm × hệ số) / tổng hệ số · ĐTB cả năm = (HK I + 2 × HK II) / 3 · ĐTB học kỳ = trung bình các môn.
      </p>

      {modal ? (
        <ScoreModal
          key={modal.entry?._id || 'add'}
          data={data}
          year={selected}
          entry={modal.entry}
          subjectNames={subjectNames}
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

function Avg({ value }) {
  return <span className={`tc-avg${value == null ? ' tc-avg--muted' : ''}`}>{formatScore(value)}</span>;
}

function ScoreChips({ entries, onEdit }) {
  if (!entries.length) return <span className="tc-empty-cell">—</span>;
  return (
    <div className="tc-scores">
      {entries.map((entry) => {
        const label = `${entry.testTypeName} (hệ số ${entry.coefficient}): ${formatScore(entry.score)}`;
        return entry.canEdit ? (
          <button key={entry._id} type="button" className="tc-score" title={`${label} — bấm để sửa`} aria-label={`Sửa điểm ${label}`} onClick={() => onEdit(entry)}>
            {formatScore(entry.score)} <small>{entry.testTypeName}</small>
          </button>
        ) : (
          <span key={entry._id} className="tc-score" title={`${label} · ${entry.enteredByName}`}>
            {formatScore(entry.score)} <small>{entry.testTypeName}</small>
          </span>
        );
      })}
    </div>
  );
}

function ScoreModal({ data, year, entry, subjectNames, onClose }) {
  const add = useMutation(anyApi.gradebook.addEntry);
  const update = useMutation(anyApi.gradebook.updateEntry);
  const remove = useMutation(anyApi.gradebook.removeEntry);
  const task = useAsyncTask();
  const today = vietnamNowParts().date;
  const [subjectId, setSubjectId] = useState(entry?.subjectId || data.writableSubjectIds[0] || '');
  const [semester, setSemester] = useState(entry?.semester || semesterForDate(today, year));
  const [testTypeId, setTestTypeId] = useState(
    entry?.testTypeId && data.testTypes.some((row) => row._id === entry.testTypeId) ? entry.testTypeId : entry ? '' : data.testTypes[0]?._id || '',
  );
  const [score, setScore] = useState(entry ? String(entry.score) : '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const numeric = Number(String(score).replace(',', '.'));
  const scoreValid = score !== '' && Number.isFinite(numeric) && numeric >= 0 && numeric <= 10 && Math.abs(Math.round(numeric * 100) - numeric * 100) < 1e-6;
  // Loại kiểm tra đã bị xoá: giữ nguyên loại cũ khi sửa (server chỉ đổi khi chọn loại khác).
  const keepsRemovedType = entry && !testTypeId;
  const valid = scoreValid && subjectId && (testTypeId || keepsRemovedType);

  const submit = async () => {
    const value = Math.round(numeric * 100) / 100;
    const outcome = entry
      ? await task.run(() => update({ id: entry._id, semester, testTypeId: testTypeId || entry.testTypeId, score: value }))
      : await task.run(() =>
          add({ studentId: data.student._id, classId: data.selectedClassId, subjectId, semester, testTypeId, score: value }),
        );
    if (outcome.ok) onClose();
  };

  return (
    <Modal
      title={entry ? 'Sửa điểm' : 'Thêm điểm'}
      subtitle={`${data.student.fullName}${year ? ` · ${classLabel(year.className)} · ${year.name}` : ''}`}
      size="sm"
      onClose={onClose}
      busy={task.pending}
      footer={
        confirmDelete ? (
          <>
            <button type="button" className="hr-button hr-button--ghost" onClick={() => setConfirmDelete(false)} disabled={task.pending}>Hủy</button>
            <button
              type="button"
              className="primary-button hr-button--danger"
              disabled={task.pending}
              onClick={async () => {
                const outcome = await task.run(() => remove({ id: entry._id }));
                if (outcome.ok) onClose();
              }}
            >
              {task.pending ? 'Đang xóa…' : 'Xóa điểm'}
            </button>
          </>
        ) : (
          <>
            {entry ? (
              <button type="button" className="hr-button hr-button--danger-ghost hr-push-left" onClick={() => setConfirmDelete(true)} disabled={task.pending}>
                <Icon name="trash" size={15} /> Xóa
              </button>
            ) : null}
            <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Hủy</button>
            <button type="button" className="primary-button" onClick={() => void submit()} disabled={!valid || task.pending}>
              {task.pending ? 'Đang lưu…' : 'Lưu'}
            </button>
          </>
        )
      }
    >
      <div className="hr-form">
        {confirmDelete ? (
          <Notice tone="danger" icon="trash" title="Xóa điểm này?">
            {subjectNames.get(entry.subjectId)} · {entry.testTypeName}: {formatScore(entry.score)}. ĐTB sẽ được tính lại.
          </Notice>
        ) : (
          <>
            {entry ? (
              <p className="hr-hint">
                {subjectNames.get(entry.subjectId)} · nhập bởi {entry.enteredByName || '—'} lúc {formatDateTime(entry.createdAt)}
              </p>
            ) : data.writableSubjectIds.length > 1 ? (
              <label className="hr-field">
                <span>Môn học</span>
                <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                  {data.writableSubjectIds.map((id) => (
                    <option key={id} value={id}>{subjectNames.get(id) || 'Môn học'}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="hr-hint">Môn: <strong>{subjectNames.get(subjectId) || 'Môn học'}</strong></p>
            )}
            <label className="hr-field">
              <span>Loại kiểm tra</span>
              <select value={testTypeId} onChange={(event) => setTestTypeId(event.target.value)}>
                {keepsRemovedType ? <option value="">{entry.testTypeName} (hệ số {entry.coefficient})</option> : null}
                {data.testTypes.map((row) => (
                  <option key={row._id} value={row._id}>{row.name} (hệ số {row.coefficient})</option>
                ))}
              </select>
            </label>
            <label className="hr-field">
              <span>Điểm số (0 – 10)</span>
              <input
                inputMode="decimal"
                value={score}
                onChange={(event) => setScore(event.target.value)}
                aria-invalid={score !== '' && !scoreValid}
              />
            </label>
            {score !== '' && !scoreValid ? (
              <p className="hr-alert hr-alert--error">Điểm từ 0 đến 10, tối đa 2 chữ số thập phân (ví dụ 8,5).</p>
            ) : null}
            <label className="hr-field">
              <span>Học kỳ</span>
              <select value={semester} onChange={(event) => setSemester(Number(event.target.value))}>
                <option value={1}>Học kỳ I</option>
                <option value={2}>Học kỳ II</option>
              </select>
            </label>
          </>
        )}
        <Feedback error={task.error} />
      </div>
    </Modal>
  );
}
