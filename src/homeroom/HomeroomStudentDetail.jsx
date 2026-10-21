import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import {
  formatDate,
  formatDateTime,
  formatTime,
  genderLabel,
  GUARDIAN_RELATIONSHIPS,
  percent,
  rawLabel,
  relationshipLabel,
  statusLabel,
  studentInitials,
  weekdayLabel,
} from './homeroomLabels';
import { EmptyState, Feedback, Icon, Kpi, Loading, Modal, StatusChip, useAsyncTask } from './homeroomUi';

const ENROLLMENT_STATUS = {
  active: 'Đang học',
  transferred: 'Đã chuyển lớp',
  withdrawn: 'Đã nghỉ học',
};

export default function HomeroomStudentDetail({ studentId, nav }) {
  const data = useQuery(anyApi.students.getScoped, { studentId });
  const history = useQuery(anyApi.studentAttendance.getStudentHistory, { studentId });
  const [onlyAbsent, setOnlyAbsent] = useState(false);
  const [modal, setModal] = useState(null);

  const days = useMemo(
    () => (history?.days || []).slice().sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate)),
    [history],
  );
  const stats = useMemo(() => {
    const counts = { present: 0, late: 0, absent_excused: 0, absent_unexcused: 0, absent_pending: 0 };
    for (const day of days) if (day.effectiveStatus in counts) counts[day.effectiveStatus] += 1;
    const rated = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return { counts, rated, rate: rated ? (counts.present + counts.late) / rated : 0 };
  }, [days]);

  if (data === undefined) return <Loading label="Đang tải hồ sơ học sinh…" />;
  const { student, enrollments, guardians, showContacts, permissions } = data;
  const current = enrollments.find((row) => row.current);
  const classCodeById = new Map(enrollments.map((row) => [row.classId, row.classCode]));
  const visibleDays = onlyAbsent ? days.filter((day) => day.rawObservation === 'absent' || day.effectiveStatus === 'late') : days;
  const corrections = (history?.corrections || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));

  return (
    <div className="hr-stack">
      <header className="hr-class-head">
        <button type="button" className="hr-back" onClick={nav.back}>
          <Icon name="arrowLeft" size={16} /> Quay lại
        </button>
        <div className="hr-class-head-main">
          <span className="hr-avatar hr-avatar--xl" aria-hidden="true">{studentInitials(student.fullName)}</span>
          <div>
            <h2>{student.fullName}</h2>
            <p className="hr-class-meta">
              <span>Mã HS {student.studentCode}</span>
              {student.dateOfBirth ? <span>Sinh {formatDate(student.dateOfBirth)}</span> : null}
              <span>{genderLabel(student.gender)}</span>
              {current ? (
                <button type="button" className="hr-link" onClick={() => nav.openClass(current.classId)}>
                  Lớp {current.classCode}
                </button>
              ) : (
                <span className="hr-tag hr-tag--muted">Hiện không học lớp nào</span>
              )}
            </p>
          </div>
        </div>
      </header>

      <div className="hr-kpi-grid">
        <Kpi label="Chuyên cần" value={stats.rated ? percent(stats.rate) : '—'} tone="rate" hint={`${stats.rated} buổi có dữ liệu`} />
        <Kpi label="Đi trễ" value={stats.counts.late} tone="late" />
        <Kpi label="Vắng có phép" value={stats.counts.absent_excused} tone="excused" />
        <Kpi label="Vắng không phép" value={stats.counts.absent_unexcused} tone="absent" />
        <Kpi label="Chờ xử lý" value={stats.counts.absent_pending} tone="pending" />
      </div>

      <div className="hr-two-col">
        <section className="hr-panel">
          <header className="hr-panel-head">
            <h3>Liên hệ</h3>
            {permissions.canEditContacts && guardians.length < 6 ? (
              <button type="button" className="primary-button hr-button--sm" onClick={() => setModal({ kind: 'guardian', guardian: null })}>
                <Icon name="plus" size={14} /> Thêm phụ huynh
              </button>
            ) : null}
          </header>
          {!showContacts ? (
            <p className="hr-muted"><Icon name="eye" size={13} /> Thông tin liên hệ chỉ hiển thị cho GVCN của lớp và quản trị viên.</p>
          ) : (
            <ul className="hr-contact-list">
              <li>
                <span className="hr-contact-role">Học sinh</span>
                {student.dateOfBirth ? (
                  <span><Icon name="calendar" size={13} /> Ngày sinh {formatDate(student.dateOfBirth)}</span>
                ) : (
                  <span className="hr-muted">Chưa có ngày sinh</span>
                )}
              </li>
              {guardians.map((row) => (
                <li key={row._id}>
                  <span className="hr-contact-role">
                    {relationshipLabel(row.relationship)}
                    {row.isPrimaryContact ? <span className="hr-tag hr-tag--ok">Liên hệ chính</span> : null}
                  </span>
                  <strong>{row.fullName}</strong>
                  {row.phone ? <a href={`tel:${row.phone}`}><Icon name="phone" size={13} /> {row.phone}</a> : <span className="hr-muted">Chưa có SĐT</span>}
                  {row.notes ? <span className="hr-sub">{row.notes}</span> : null}
                  {permissions.canEditContacts ? (
                    <button type="button" className="hr-icon-button" aria-label={`Sửa ${row.fullName}`} onClick={() => setModal({ kind: 'guardian', guardian: row })}>
                      <Icon name="edit" size={15} />
                    </button>
                  ) : null}
                </li>
              ))}
              {!guardians.length ? <li className="hr-muted">Chưa có thông tin phụ huynh.</li> : null}
            </ul>
          )}
        </section>

        <section className="hr-panel">
          <header className="hr-panel-head"><h3>Quá trình học</h3></header>
          {!enrollments.length ? (
            <p className="hr-muted">Không có quá trình học trong phạm vi bạn được xem.</p>
          ) : (
            <ol className="hr-timeline">
              {enrollments.map((row) => (
                <li key={row._id} className={row.current ? 'is-current' : ''}>
                  <button type="button" className="hr-link" onClick={() => nav.openClass(row.classId)}>
                    Lớp {row.classCode || '—'}
                  </button>
                  <span className="hr-sub">
                    {formatDate(row.startDate)} – {row.endDate ? formatDate(row.endDate) : 'nay'} · {ENROLLMENT_STATUS[row.status] || row.status}
                    {row.rosterNumber ? ` · STT ${row.rosterNumber}` : ''}
                  </span>
                  {row.transferReason ? <span className="hr-sub">Lý do: {row.transferReason}</span> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="hr-panel">
        <header className="hr-panel-head">
          <h3>Lịch sử điểm danh</h3>
          <label className="hr-switch">
            <input type="checkbox" checked={onlyAbsent} onChange={(e) => setOnlyAbsent(e.target.checked)} />
            <span>Chỉ hiện vắng / trễ</span>
          </label>
        </header>
        {history === undefined ? (
          <Loading />
        ) : !visibleDays.length ? (
          <EmptyState icon="calendar" title={onlyAbsent ? 'Không có buổi vắng hoặc trễ.' : 'Chưa có dữ liệu điểm danh.'} />
        ) : (
          <div className="hr-table-wrap hr-table-wrap--scroll">
            <table className="hr-table">
              <thead>
                <tr><th>Ngày</th><th>Lớp</th><th>Ghi nhận</th><th>Kết quả</th><th>Lý do / ghi chú</th></tr>
              </thead>
              <tbody>
                {visibleDays.map((day) => (
                  <tr key={day._id}>
                    <td>{weekdayLabel(day.attendanceDate, true)}, {formatDate(day.attendanceDate)}</td>
                    <td>{classCodeById.get(day.classId) || '—'}</td>
                    <td>
                      {rawLabel(day.rawObservation)}
                      {day.rawObservedAt ? <span className="hr-sub"> {formatTime(day.rawObservedAt)}</span> : null}
                    </td>
                    <td><StatusChip status={day.effectiveStatus} /></td>
                    <td className="hr-note-cell">{[day.reasonCode, day.note].filter(Boolean).join(' — ') || <span className="hr-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {corrections.length ? (
        <section className="hr-panel">
          <header className="hr-panel-head"><h3>Lịch sử phân loại vắng</h3></header>
          <ol className="hr-timeline hr-timeline--compact">
            {corrections.map((row) => (
              <li key={row._id}>
                <strong>Buổi {formatDate(row.attendanceDate)}:</strong> {statusLabel(row.previousEffectiveStatus)} → {statusLabel(row.nextEffectiveStatus)}
                <span className="hr-sub">
                  {[row.reasonCode, row.note].filter(Boolean).join(' — ') || 'Không ghi lý do'} · {formatDateTime(row.at)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {modal?.kind === 'guardian' ? <GuardianModal studentId={student._id} guardian={modal.guardian} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

function GuardianModal({ studentId, guardian, onClose }) {
  const upsert = useMutation(anyApi.students.upsertGuardian);
  const remove = useMutation(anyApi.students.removeGuardian);
  const [form, setForm] = useState({
    relationship: guardian?.relationship || 'mother',
    fullName: guardian?.fullName || '',
    phone: guardian?.phone || '',
    isPrimaryContact: Boolean(guardian?.isPrimaryContact),
    notes: guardian?.notes || '',
  });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const task = useAsyncTask();
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Modal
      title={guardian ? 'Sửa thông tin phụ huynh' : 'Thêm phụ huynh'}
      onClose={onClose}
      busy={task.pending}
      footer={
        <>
          {guardian ? (
            confirmRemove ? (
              <button
                type="button"
                className="hr-button hr-button--danger"
                disabled={task.pending}
                onClick={async () => {
                  const outcome = await task.run(() => remove({ studentId, guardianId: guardian._id }));
                  if (outcome.ok) onClose();
                }}
              >
                Xác nhận xóa
              </button>
            ) : (
              <button type="button" className="hr-button hr-button--ghost hr-push-left" onClick={() => setConfirmRemove(true)} disabled={task.pending}>
                <Icon name="trash" size={14} /> Xóa
              </button>
            )
          ) : null}
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Hủy</button>
          <button type="submit" form="hr-guardian" className="primary-button" disabled={task.pending}>{task.pending ? 'Đang lưu…' : 'Lưu'}</button>
        </>
      }
    >
      <form
        id="hr-guardian"
        className="hr-form hr-form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          const outcome = await task.run(() =>
            upsert({
              studentId,
              guardianId: guardian?._id,
              relationship: form.relationship,
              fullName: form.fullName,
              phone: form.phone.trim() || undefined,
              isPrimaryContact: form.isPrimaryContact,
              notes: form.notes.trim() || undefined,
            }),
          );
          if (outcome.ok) onClose();
        }}
      >
        <label className="hr-field">
          <span>Quan hệ</span>
          <select value={form.relationship} onChange={set('relationship')}>
            {GUARDIAN_RELATIONSHIPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="hr-field">
          <span>Họ và tên *</span>
          <input value={form.fullName} onChange={set('fullName')} required maxLength={120} />
        </label>
        <label className="hr-field">
          <span>Số điện thoại</span>
          <input type="tel" value={form.phone} onChange={set('phone')} maxLength={20} />
        </label>
        <label className="hr-switch hr-form-span">
          <input type="checkbox" checked={form.isPrimaryContact} onChange={(e) => setForm((c) => ({ ...c, isPrimaryContact: e.target.checked }))} />
          <span>Liên hệ chính (gọi đầu tiên khi học sinh vắng)</span>
        </label>
        <label className="hr-field hr-form-span">
          <span>Ghi chú</span>
          <textarea rows={2} value={form.notes} onChange={set('notes')} maxLength={300} />
        </label>
        <div className="hr-form-span"><Feedback error={task.error} /></div>
      </form>
    </Modal>
  );
}
