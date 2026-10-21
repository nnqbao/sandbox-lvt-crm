import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { vietnamTodayYmd } from './homeroomTime';
import {
  addDays,
  endOfMonth,
  formatDate,
  formatTime,
  isYmd,
  percent,
  schoolDayLabel,
  startOfMonth,
  startOfWeek,
  studentInitials,
  weekdayLabel,
} from './homeroomLabels';
import { AttendanceReportsTable } from './AttendanceReportsTable';
import { downloadAttendancePdf, downloadAttendanceXlsx } from './homeroomExport';
import { messageFor } from '../lib/appErrorMessage';
import {
  classNotMarked,
  isUnexcused,
  nextDispositionForToggle,
  notMarkedMessage,
  splitAttendanceRows,
} from './attendanceDay';
import HomeroomRoster from './HomeroomRoster';
import { ClassManagePanel } from './HomeroomClassCatalog';
import { classStatusLabel } from './classCatalog';
import {
  AttendanceBar,
  DateStepper,
  EmptyState,
  Feedback,
  HomeroomViewErrorBoundary,
  Icon,
  Kpi,
  Loading,
  Notice,
  StatusChip,
} from './homeroomUi';

const TABS = [
  { key: 'hoc-sinh', label: 'Học sinh', icon: 'users' },
  { key: 'diem-danh', label: 'Điểm danh', icon: 'calendar' },
  { key: 'bao-cao', label: 'Báo cáo', icon: 'chart' },
  { key: 'quan-ly', label: 'Quản lý lớp', icon: 'settings', managerOnly: true },
];

export default function HomeroomClassDetail({ classId, tab, initialDate = '', session, nav }) {
  const detail = useQuery(anyApi.homeroomClasses.getScoped, { classId });
  if (detail === undefined) return <Loading label="Đang tải lớp…" />;
  const archived = detail.class.status === 'archived';
  const tabs = TABS.filter((item) => !item.managerOnly || detail.permissions.canManage);
  const current = tabs.some((item) => item.key === tab) ? tab : 'hoc-sinh';

  return (
    <div className="hr-stack">
      <header className="hr-class-head">
        <button type="button" className="hr-back" onClick={nav.back}>
          <Icon name="arrowLeft" size={16} /> Quay lại
        </button>
        <div className="hr-class-head-main">
          <span className="hr-class-code hr-class-code--lg">{detail.class.code}</span>
          <div>
            <h2>{detail.class.name}</h2>
            <p className="hr-class-meta">
              <span>Khối {detail.class.gradeLevel}</span>
              {detail.schoolYear ? <span>Năm học {detail.schoolYear.name}</span> : null}
              <span>Sĩ số {detail.rosterCount}</span>
              <span>GVCN: {detail.currentTeacherName || 'Chưa phân công'}</span>
              {archived ? <span className="hr-tag hr-tag--muted">{classStatusLabel('archived')}</span> : null}
            </p>
          </div>
        </div>
      </header>
      {archived ? (
        <Notice tone="warn" icon="archive" title="Lớp đã lưu trữ — chỉ xem.">
          Không thể điểm danh, đánh dấu vắng không phép hay thay đổi danh sách.{detail.permissions.canManage ? ' Có thể khôi phục lớp trong tab Quản lý lớp.' : ''}
        </Notice>
      ) : null}
      <nav className="hr-tabs" aria-label="Điều hướng lớp">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-current={current === item.key ? 'page' : undefined}
            onClick={() => nav.openClass(classId, item.key === 'hoc-sinh' ? '' : item.key)}
          >
            <Icon name={item.icon} size={16} /> {item.label}
          </button>
        ))}
      </nav>
      <HomeroomViewErrorBoundary resetKey={current} onBack={() => nav.openClass(classId)} backLabel="Về danh sách lớp">
        {current === 'diem-danh' ? (
          <AttendanceTab classId={classId} initialDate={initialDate} nav={nav} />
        ) : current === 'bao-cao' ? (
          <ReportsTab classId={classId} detail={detail} />
        ) : current === 'quan-ly' ? (
          <ClassManagePanel classId={classId} detail={detail} session={session} canManage={detail.permissions.canManage} />
        ) : (
          <HomeroomRoster classId={classId} detail={detail} nav={nav} />
        )}
      </HomeroomViewErrorBoundary>
    </div>
  );
}

/* ------------------------------ Điểm danh ------------------------------ */

function AttendanceTab({ classId, initialDate, nav }) {
  const today = vietnamTodayYmd();
  const [date, setDate] = useState(() => (isYmd(initialDate) ? initialDate : today));
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const setDisposition = useMutation(anyApi.studentAttendance.setDisposition);
  const data = useQuery(anyApi.studentAttendance.listDailyClass, { classId, attendanceDate: date });

  const rows = data?.rows || [];
  const { absent, others } = useMemo(() => splitAttendanceRows(rows), [rows]);
  const counts = useMemo(() => {
    const result = {};
    for (const row of rows) {
      const key = row.day?.effectiveStatus || 'no_data';
      result[key] = (result[key] || 0) + 1;
    }
    return result;
  }, [rows]);
  const canCorrect = Boolean(data?.canCorrect);

  const changeDate = (next) => {
    setDate(next);
    setError('');
    setSuccess('');
  };

  const save = async (row, patch, message) => {
    setBusyId(row.day._id);
    setError('');
    setSuccess('');
    try {
      await setDisposition({
        attendanceDayId: row.day._id,
        nextDisposition: patch.nextDisposition ?? row.day.disposition,
        reasonCode: row.day.reasonCode || undefined,
        note: (patch.note ?? row.day.note) || undefined,
      });
      setSuccess(message);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusyId('');
    }
  };

  const toggleUnexcused = (row, checked) =>
    save(
      row,
      { nextDisposition: nextDispositionForToggle(checked) },
      `${row.student.fullName}: ${checked ? 'vắng không phép' : 'vắng có phép'}.`,
    );

  return (
    <div className="hr-stack">
      <div className="hr-day-strip">
        <DateStepper value={date} onChange={changeDate} max={today} />
        {data?.schoolDay ? (
          <span className={`hr-day-badge ${data.schoolDay.isSchoolDay ? 'is-school' : 'is-off'}`}>
            <Icon name={data.schoolDay.isSchoolDay ? 'check' : 'calendar'} size={14} />
            {schoolDayLabel(data.schoolDay)}
            {data.schoolDay.note ? <em>· {data.schoolDay.note}</em> : null}
          </span>
        ) : null}
        {date !== today ? (
          <button type="button" className="hr-button hr-button--ghost" onClick={() => changeDate(today)}>Về hôm nay</button>
        ) : null}
      </div>

      {data === undefined ? (
        <Loading label="Đang tải điểm danh…" />
      ) : !rows.length ? (
        <EmptyState icon="users" title="Lớp không có học sinh vào ngày này." />
      ) : classNotMarked(data) ? (
        <div className="hr-panel">
          <EmptyState icon="clock" title={notMarkedMessage(date, today, formatDate)}>
            {data.schoolDay?.isSchoolDay
              ? 'Khi Giám thị lưu điểm danh, học sinh vắng sẽ hiện ở đầu danh sách để bạn đánh dấu vắng không phép.'
              : 'Đây không phải ngày học.'}
          </EmptyState>
        </div>
      ) : (
        <section className="hr-panel">
          <header className="hr-panel-head">
            <div>
              <h3>{weekdayLabel(date)}, {formatDate(date)}</h3>
              <AttendanceBar counts={counts} total={rows.length} />
            </div>
            {data.classSaved ? (
              <p className="hr-muted">
                Giám thị lưu lúc {formatTime(data.classSaved.savedAt)}
                {data.classSaved.savedByName ? ` · ${data.classSaved.savedByName}` : ''}
              </p>
            ) : null}
          </header>
          <ul className="hr-att-summary" aria-label="Tóm tắt điểm danh">
            <li><StatusChip status="present" /> <b>{(counts.present || 0) + (counts.late || 0)}</b></li>
            <li><StatusChip status="absent_excused" /> <b>{counts.absent_excused || 0}</b></li>
            <li><StatusChip status="absent_unexcused" /> <b>{counts.absent_unexcused || 0}</b></li>
            {counts.absent_pending ? <li><StatusChip status="absent_pending" /> <b>{counts.absent_pending}</b></li> : null}
          </ul>
          <Feedback error={error} success={success} />
          {!canCorrect && !data.archived && absent.length ? (
            <p className="hr-hint"><Icon name="eye" size={13} /> Chỉ GVCN của lớp (hoặc quản trị viên) mới đánh dấu được vắng không phép.</p>
          ) : null}

          <h4 className="hr-att-heading">Vắng ({absent.length})</h4>
          {absent.length ? (
            <ul className="hr-att-list">
              {absent.map((row) => (
                <AttendanceRow
                  key={row.enrollment._id}
                  row={row}
                  absent
                  canCorrect={canCorrect}
                  busy={busyId === row.day?._id}
                  onOpen={() => nav.openStudent(row.student._id)}
                  onToggle={(checked) => toggleUnexcused(row, checked)}
                  onNote={(note) => save(row, { note }, `Đã lưu ghi chú cho ${row.student.fullName}.`)}
                />
              ))}
            </ul>
          ) : (
            <p className="hr-muted">Không có học sinh vắng.</p>
          )}

          <h4 className="hr-att-heading">Có mặt ({others.length})</h4>
          <ul className="hr-att-list">
            {others.map((row) => (
              <AttendanceRow key={row.enrollment._id} row={row} onOpen={() => nav.openStudent(row.student._id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AttendanceRow({ row, absent = false, canCorrect = false, busy = false, onOpen, onToggle = undefined, onNote = undefined }) {
  const status = row.day?.effectiveStatus || 'no_data';
  const unexcused = isUnexcused(row.day);
  const [note, setNote] = useState(row.day?.note || '');
  const checkboxId = `hr-unexcused-${row.enrollment._id}`;
  return (
    <li className={`hr-att-row${absent ? ' is-absent' : ''}${unexcused ? ' is-unexcused' : ''}`}>
      <button type="button" className="hr-person" onClick={onOpen}>
        <span className="hr-avatar" aria-hidden="true">{studentInitials(row.student.fullName)}</span>
        <span>
          <strong>{row.enrollment.rosterNumber ? `${row.enrollment.rosterNumber}. ` : ''}{row.student.fullName}</strong>
          <span className="hr-sub">{row.student.studentCode}</span>
        </span>
      </button>
      <span className="hr-att-status">
        {absent ? <Icon name="alert" size={15} /> : null}
        <StatusChip status={status} />
      </span>
      {absent && canCorrect ? (
        <>
          <label className="hr-att-check" htmlFor={checkboxId}>
            <input
              id={checkboxId}
              type="checkbox"
              checked={unexcused}
              disabled={busy}
              onChange={(event) => onToggle(event.target.checked)}
            />
            Vắng không phép
          </label>
          <label className="hr-att-note">
            <span>Ghi chú (không bắt buộc)</span>
            <input
              value={note}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
              onBlur={() => {
                if (note.trim() !== (row.day?.note || '')) onNote(note.trim());
              }}
            />
          </label>
        </>
      ) : absent && (row.day?.note || row.day?.reasonCode) ? (
        <span className="hr-att-note-text">{[row.day.reasonCode, row.day.note].filter(Boolean).join(' — ')}</span>
      ) : null}
    </li>
  );
}

/* ------------------------------ Báo cáo ------------------------------ */

function presetRange(key, today, yearStart) {
  if (key === 'week') return { from: startOfWeek(today), to: today };
  if (key === 'last-month') {
    const lastMonthEnd = addDays(startOfMonth(today), -1);
    return { from: startOfMonth(lastMonthEnd), to: endOfMonth(lastMonthEnd) };
  }
  if (key === 'year') return { from: yearStart && yearStart <= today ? yearStart : startOfMonth(today), to: today };
  return { from: startOfMonth(today), to: today };
}

const PRESETS = [
  ['week', 'Tuần này'],
  ['month', 'Tháng này'],
  ['last-month', 'Tháng trước'],
  ['year', 'Từ đầu năm'],
];

function ReportsTab({ classId, detail }) {
  const today = vietnamTodayYmd();
  const yearStart = useQuery(anyApi.schoolYears.list, {})?.find((row) => row._id === detail.class.schoolYearId)?.startDate;
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(() => presetRange('month', today, ''));
  const [showDays, setShowDays] = useState(false);
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const valid = isYmd(range.from) && isYmd(range.to) && range.from <= range.to;
  const report = useQuery(
    anyApi.homeroomReports.attendanceSummary,
    valid ? { classId, schoolYearId: detail.class.schoolYearId, from: range.from, to: range.to } : 'skip',
  );

  const pick = (key) => {
    setPreset(key);
    setRange(presetRange(key, today, yearStart));
  };

  const exportAs = async (kind) => {
    setExporting(kind);
    setExportError('');
    try {
      if (kind === 'xlsx') downloadAttendanceXlsx(report.exportPayload);
      else await downloadAttendancePdf(report.exportPayload);
    } catch {
      setExportError('Không xuất được file. Vui lòng thử lại.');
    } finally {
      setExporting('');
    }
  };

  const counts = report?.summary?.counts;
  const dayCount = report ? new Set(report.summary.days.map((row) => row.attendanceDate)).size : 0;

  return (
    <div className="hr-stack">
      <section className="hr-panel">
        <div className="hr-filter-bar">
          <div className="hr-segment" role="group" aria-label="Khoảng thời gian">
            {PRESETS.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={preset === key} onClick={() => pick(key)}>{label}</button>
            ))}
          </div>
          <label className="hr-field hr-field--inline">
            <span>Từ</span>
            <input type="date" value={range.from} max={range.to} onChange={(e) => { setPreset(''); setRange((r) => ({ ...r, from: e.target.value })); }} />
          </label>
          <label className="hr-field hr-field--inline">
            <span>Đến</span>
            <input type="date" value={range.to} min={range.from} onChange={(e) => { setPreset(''); setRange((r) => ({ ...r, to: e.target.value })); }} />
          </label>
          <div className="hr-row hr-row--end hr-grow">
            <button type="button" className="hr-button" disabled={!report || Boolean(exporting)} onClick={() => void exportAs('xlsx')}>
              <Icon name="download" size={15} /> {exporting === 'xlsx' ? 'Đang xuất…' : 'Excel'}
            </button>
            <button type="button" className="hr-button" disabled={!report || Boolean(exporting)} onClick={() => void exportAs('pdf')}>
              <Icon name="file" size={15} /> {exporting === 'pdf' ? 'Đang xuất…' : 'PDF'}
            </button>
          </div>
        </div>
        {!valid ? <Feedback error="Khoảng ngày không hợp lệ: “Từ” phải trước hoặc bằng “Đến”." /> : null}
        <Feedback error={exportError} />
      </section>

      {valid && report === undefined ? (
        <Loading label="Đang tổng hợp báo cáo…" />
      ) : report ? (
        <>
          <div className="hr-kpi-grid">
            <Kpi label="Ngày có dữ liệu" value={dayCount} icon="calendar" hint={`${formatDate(range.from)} – ${formatDate(range.to)}`} />
            <Kpi label="Chuyên cần" value={report.summary.ratedRows ? percent(report.summary.attendanceRate) : '—'} tone="rate" />
            {counts.late ? <Kpi label="Đi trễ" value={counts.late} tone="late" hint="Dữ liệu camera cũ" /> : null}
            <Kpi label="Vắng có phép" value={counts.absent_excused} tone="excused" />
            <Kpi label="Vắng không phép" value={counts.absent_unexcused} tone="absent" />
            {counts.absent_pending ? <Kpi label="Vắng chờ xử lý (cũ)" value={counts.absent_pending} tone="pending" /> : null}
          </div>
          <section className="hr-panel">
            <header className="hr-panel-head">
              <h3>Theo học sinh</h3>
              <span className="hr-muted">Sắp xếp: vắng nhiều nhất trước</span>
            </header>
            {!report.studentTotals.length ? (
              <EmptyState icon="chart" title="Không có dữ liệu điểm danh trong khoảng này." />
            ) : (
              <div className="hr-table-wrap">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Học sinh</th>
                      <th className="is-num">Có mặt</th>
                      <th className="is-num">Trễ</th>
                      <th className="is-num">Có phép</th>
                      <th className="is-num">Không phép</th>
                      <th className="is-num">Chờ xử lý</th>
                      <th className="is-num">Chuyên cần</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.studentTotals.map((row) => (
                      <tr key={row.studentId} className={row.absent_unexcused >= 3 ? 'is-warning' : ''}>
                        <td>
                          <strong>{row.fullName}</strong> <span className="hr-sub">{row.studentCode}</span>
                        </td>
                        <td className="is-num">{row.present}</td>
                        <td className="is-num">{row.late || <span className="hr-muted">0</span>}</td>
                        <td className="is-num">{row.absent_excused || <span className="hr-muted">0</span>}</td>
                        <td className="is-num">{row.absent_unexcused ? <span className="hr-count hr-count--error">{row.absent_unexcused}</span> : <span className="hr-muted">0</span>}</td>
                        <td className="is-num">{row.absent_pending ? <span className="hr-count hr-count--pending">{row.absent_pending}</span> : <span className="hr-muted">0</span>}</td>
                        <td className="is-num"><RateCell value={row.attendanceRate} rated={row.ratedRows} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {report.studentTotals.some((row) => row.absent_unexcused >= 3) ? (
              <p className="hr-hint"><Icon name="alert" size={13} /> Dòng tô màu: học sinh vắng không phép từ 3 buổi trở lên trong khoảng này.</p>
            ) : null}
          </section>
          {report.summary.days.length ? (
            <section className="hr-panel">
              <header className="hr-panel-head">
                <h3>Chi tiết từng ngày</h3>
                <button type="button" className="hr-button hr-button--ghost" onClick={() => setShowDays((v) => !v)} aria-expanded={showDays}>
                  {showDays ? 'Ẩn chi tiết' : `Xem ${report.summary.days.length} dòng`}
                </button>
              </header>
              {showDays ? (
                <div className="hr-table-wrap hr-table-wrap--scroll">
                  <AttendanceReportsTable days={report.summary.days} />
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RateCell({ value, rated }) {
  if (!rated) return <span className="hr-muted">—</span>;
  const tone = value >= 0.95 ? 'good' : value >= 0.85 ? 'mid' : 'low';
  return <span className={`hr-rate hr-rate--${tone}`}>{percent(value, 0)}</span>;
}
