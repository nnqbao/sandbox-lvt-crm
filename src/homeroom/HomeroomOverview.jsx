import React, { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { pathnameForMenu } from '../navigationRoutes';
import { vietnamTodayYmd } from './homeroomTime';
import { sortClassesNatural } from './classOrder';
import { foldSearch, formatDate, percent, schoolDayLabel } from './homeroomLabels';
import { AttendanceBar, DateStepper, EmptyState, Icon, Kpi, Loading, Notice } from './homeroomUi';

export default function HomeroomOverview({ yearId, roles, nav }) {
  const today = vietnamTodayYmd();
  const [date, setDate] = useState(today);
  return <ClassesOverview yearId={yearId} date={date} setDate={setDate} today={today} roles={roles} nav={nav} />;
}

/** Điểm danh là menu riêng (Giám thị); admin/mod mở được từ cảnh báo. */
function openAttendanceMenu() {
  window.history.pushState({}, '', pathnameForMenu('attendance'));
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function absentTotal(counts) {
  return counts.absent_pending + counts.absent_excused + counts.absent_unexcused;
}

function DayStrip({ date, setDate, today, schoolDay, max }) {
  return (
    <div className="hr-day-strip">
      <DateStepper value={date} onChange={setDate} max={max} />
      {schoolDay ? (
        <span className={`hr-day-badge ${schoolDay.isSchoolDay ? 'is-school' : 'is-off'}`}>
          <Icon name={schoolDay.isSchoolDay ? 'check' : 'calendar'} size={14} />
          {schoolDayLabel(schoolDay)}
          {schoolDay.note ? <em>· {schoolDay.note}</em> : null}
        </span>
      ) : null}
      {date !== today ? (
        <button type="button" className="hr-button hr-button--ghost" onClick={() => setDate(today)}>
          Về hôm nay
        </button>
      ) : null}
    </div>
  );
}

function ClassesOverview({ yearId, date, setDate, today, roles, nav }) {
  const overview = useQuery(anyApi.homeroomReports.overview, { schoolYearId: yearId, date });
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const classes = useMemo(() => sortClassesNatural(overview?.classes), [overview?.classes]);
  const visible = useMemo(() => {
    const needle = foldSearch(search);
    return classes.filter((row) => {
      if (filter === 'missing' && row.saved) return false;
      if (!needle) return true;
      return foldSearch(`${row.code} ${row.name} ${row.teacherName}`).includes(needle);
    });
  }, [classes, filter, search]);

  if (overview === undefined) {
    return (
      <div className="hr-stack">
        <DayStrip date={date} setDate={setDate} today={today} schoolDay={null} max={today} />
        <Loading label="Đang tải tổng quan…" />
      </div>
    );
  }

  const counts = overview.summary.counts;
  const absentToday = absentTotal(counts);
  const savedCount = classes.filter((row) => row.saved).length;
  const schoolMode = overview.mode === 'school';

  return (
    <div className="hr-stack">
      <DayStrip date={date} setDate={setDate} today={today} schoolDay={overview.schoolDay} max={today} />

      {overview.schoolDay.outsideYear ? (
        <Notice tone="info" icon="calendar" title="Ngày đã chọn nằm ngoài năm học.">
          Năm học {overview.schoolYear.name}: {formatDate(overview.schoolYear.startDate)} – {formatDate(overview.schoolYear.endDate)}.
        </Notice>
      ) : !overview.schoolDay.isSchoolDay ? (
        <Notice tone="info" icon="calendar" title={`${schoolDayLabel(overview.schoolDay)} — không cần điểm danh.`}>
          {overview.schoolDay.note || 'Nếu hôm nay có dạy bù, quản trị viên đánh dấu “Ngày học bù” trong Lịch học.'}
        </Notice>
      ) : overview.missingUpload.shouldAlert ? (
        <Notice
          tone="danger"
          icon="clock"
          title={`Đã quá ${overview.missingUpload.cutoffTime} nhưng ${overview.missingUpload.missingClasses.length} lớp chưa được Giám thị điểm danh.`}
          action={
            overview.permissions.canMarkAttendance ? (
              <button type="button" className="primary-button" onClick={openAttendanceMenu}>
                <Icon name="check" size={15} /> Mở Điểm danh
              </button>
            ) : null
          }
        >
          {overview.missingUpload.missingClasses.slice(0, 12).map((row) => row.name).join(', ')}
          {overview.missingUpload.missingClasses.length > 12 ? '…' : ''}
          {!overview.permissions.canMarkAttendance ? ' — Giám thị điểm danh tại menu Điểm danh.' : ''}
        </Notice>
      ) : null}

      <div className="hr-kpi-grid">
        <Kpi label={schoolMode ? 'Học sinh toàn trường' : 'Sĩ số lớp'} value={overview.studentCount} icon="users" hint={`${classes.length} lớp`} />
        <Kpi label="Có mặt" value={counts.present} tone="present" />
        {counts.late ? <Kpi label="Đi trễ" value={counts.late} tone="late" hint="Dữ liệu camera cũ" /> : null}
        <Kpi label="Vắng" value={absentToday} tone="absent" hint={`${counts.absent_excused} có phép · ${counts.absent_unexcused} không phép`} />
        <Kpi label="Đã điểm danh" value={`${savedCount}/${classes.length}`} icon="check" hint="Số lớp Giám thị đã lưu" />
        <Kpi
          label="Chuyên cần"
          value={overview.summary.ratedRows ? percent(overview.summary.attendanceRate) : '—'}
          tone="rate"
          hint="Có mặt / tổng buổi"
        />
      </div>

      {schoolMode ? (
        <section className="hr-panel">
          <header className="hr-panel-head">
            <div>
              <h2>Bảng điểm danh toàn trường</h2>
              <p className="hr-muted">Bấm vào một lớp để xem chi tiết ngày {formatDate(date)}.</p>
            </div>
            <div className="hr-row hr-row--wrap">
              <div className="hr-segment" role="group" aria-label="Lọc lớp">
                {[
                  ['all', `Tất cả (${classes.length})`],
                  ['missing', `Chưa điểm danh (${classes.length - savedCount})`],
                ].map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="hr-search">
                <Icon name="search" size={15} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm lớp, GVCN…" aria-label="Tìm lớp" />
              </label>
            </div>
          </header>
          {!classes.length ? (
            <EmptyState icon="classes" title="Chưa có lớp đang hoạt động trong năm học này.">
              {roles.isManager ? 'Tạo lớp và phân công GVCN trong mục Quản lý lớp.' : null}
            </EmptyState>
          ) : !visible.length ? (
            <EmptyState icon="search" title="Không có lớp phù hợp bộ lọc." />
          ) : (
            <SchoolBoard classes={visible} onOpen={(id) => nav.openClass(id, 'diem-danh', date)} />
          )}
        </section>
      ) : (
        <section className="hr-stack">
          <h2 className="hr-section-title">Lớp đang chủ nhiệm</h2>
          {!classes.length ? (
            <div className="hr-panel">
              <EmptyState icon="classes" title="Bạn chưa được phân công chủ nhiệm lớp nào vào ngày này.">
                Khi quản trị viên phân công, lớp sẽ hiện ở đây cùng tình hình điểm danh hằng ngày.
              </EmptyState>
            </div>
          ) : (
            <ul className="hr-class-cards">
              {classes.map((row) => (
                <TeacherClassCard key={row._id} row={row} date={date} nav={nav} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function SchoolBoard({ classes, onOpen }) {
  const grades = [...new Set(classes.map((row) => row.gradeLevel))].sort((a, b) => a - b);
  return (
    <div className="hr-table-wrap">
      <table className="hr-table hr-board">
        <thead>
          <tr>
            <th scope="col">Lớp</th>
            <th scope="col">GVCN</th>
            <th scope="col" className="is-num">Sĩ số</th>
            <th scope="col" className="hr-board-bar-col">Tình hình</th>
            <th scope="col" className="is-num">Có mặt</th>
            <th scope="col" className="is-num">Vắng</th>
            <th scope="col" className="is-num">Không phép</th>
          </tr>
        </thead>
        {grades.map((grade) => {
          const rows = classes.filter((row) => row.gradeLevel === grade);
          return (
            <tbody key={grade}>
              <tr className="hr-board-group">
                <th colSpan={7} scope="rowgroup">Khối {grade} · {rows.length} lớp</th>
              </tr>
              {rows.map((row) => (
                <tr key={row._id} className="is-clickable" onClick={() => onOpen(row._id)}>
                  <th scope="row">
                    <button type="button" className="hr-link" onClick={(event) => { event.stopPropagation(); onOpen(row._id); }}>
                      {row.code}
                    </button>
                    {row.name !== row.code ? <span className="hr-sub">{row.name}</span> : null}
                  </th>
                  <td>{row.teacherName || <span className="hr-muted">Chưa phân công</span>}</td>
                  <td className="is-num">{row.rosterCount}</td>
                  <td className="hr-board-bar-col">
                    {row.published ? (
                      <AttendanceBar counts={row.counts} total={row.rosterCount} compact />
                    ) : (
                      <span className="hr-tag hr-tag--muted">Chưa điểm danh</span>
                    )}
                  </td>
                  <td className="is-num">{row.published ? row.counts.present : '—'}</td>
                  <td className="is-num">{row.published ? absentTotal(row.counts) : '—'}</td>
                  <td className="is-num">
                    {row.counts.absent_unexcused ? <span className="hr-count hr-count--error">{row.counts.absent_unexcused}</span> : <span className="hr-muted">{row.published ? 0 : '—'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}

function TeacherClassCard({ row, date, nav }) {
  const absent = absentTotal(row.counts);
  return (
    <li className="hr-class-card">
      <div className="hr-class-card-head">
        <span className="hr-class-code">{row.code}</span>
        <div>
          <strong>{row.name}</strong>
          <span className="hr-sub">Khối {row.gradeLevel} · Sĩ số {row.rosterCount}</span>
        </div>
      </div>
      {row.published ? (
        <>
          <AttendanceBar counts={row.counts} total={row.rosterCount} />
          <dl className="hr-mini-stats">
            <div><dt>Có mặt</dt><dd>{row.counts.present}</dd></div>
            <div><dt>Vắng</dt><dd>{absent}</dd></div>
            <div><dt>Không phép</dt><dd>{row.counts.absent_unexcused}</dd></div>
          </dl>
        </>
      ) : (
        <p className="hr-class-card-empty"><Icon name="clock" size={15} /> Giám thị chưa điểm danh lớp này ngày {formatDate(date)}.</p>
      )}
      <div className="hr-class-card-actions">
        {absent ? (
          <button type="button" className="hr-button" onClick={() => nav.openClass(row._id, 'diem-danh', date)}>
            <Icon name="calendar" size={15} /> Xem {absent} học sinh vắng
          </button>
        ) : null}
        <button type="button" className="primary-button" onClick={() => nav.openClass(row._id)}>
          Mở lớp <Icon name="arrowRight" size={15} />
        </button>
      </div>
    </li>
  );
}
