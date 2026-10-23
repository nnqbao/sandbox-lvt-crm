import React, { useMemo, useState } from 'react';
import { formatDate, monthLabel } from '../homeroom/homeroomLabels';
import { EmptyState, Icon } from '../homeroom/homeroomUi';
import {
  addDaysYmd,
  addMonthsYmd,
  expandLessons,
  isoWeekday,
  lessonStartTime,
  monthEnd,
  monthStart,
  periodLabel,
  quarterRange,
  SESSION_LABELS,
  TIMETABLE_PERIODS,
  TIMETABLE_SESSIONS,
  TIMETABLE_WEEKDAYS,
  vietnamNowParts,
  WEEKDAY_LABELS,
  weekStart,
} from '../lib/teachingSchedule';

const VIEWS = [
  ['list', 'Danh sách'],
  ['week', 'Tuần'],
  ['month', 'Tháng'],
  ['quarter', 'Quý'],
  ['year', 'Năm'],
];

function clampDate(date, year) {
  if (date < year.startDate) return year.startDate;
  if (date > year.endDate) return year.endDate;
  return date;
}

function rangeFor(view, anchor, year) {
  if (view === 'week') {
    const from = weekStart(anchor);
    return { from, to: addDaysYmd(from, 4), label: `Tuần ${formatDate(from)} – ${formatDate(addDaysYmd(from, 4))}` };
  }
  if (view === 'quarter') {
    const q = quarterRange(anchor);
    return { from: q.from, to: q.to, label: `Quý ${q.quarter}/${q.year}` };
  }
  if (view === 'year') return { from: year.startDate, to: year.endDate, label: `Năm học ${year.name}` };
  const from = monthStart(anchor);
  return { from, to: monthEnd(anchor), label: monthLabel(from) };
}

function shift(view, anchor, delta) {
  if (view === 'week') return addDaysYmd(anchor, 7 * delta);
  if (view === 'quarter') return addMonthsYmd(anchor, 3 * delta);
  return addMonthsYmd(anchor, delta);
}

/**
 * Lịch dạy cả năm của một giáo viên ở 5 dạng xem. `data` = { year, holidays, slots, classes }.
 * Lịch tuần (TKB) được trải ra theo Thiết lập năm học, bỏ ngày nghỉ lễ.
 */
export default function ScheduleCalendar({ data, subjectNames }) {
  const today = vietnamNowParts().date;
  const [view, setView] = useState('list');
  const [anchor, setAnchor] = useState(() => clampDate(today, data.year));
  const holidays = useMemo(() => new Set(data.holidays || []), [data.holidays]);
  const classNames = useMemo(() => new Map((data.classes || []).map((row) => [row._id, row.name])), [data.classes]);
  const range = rangeFor(view, anchor, data.year);
  const lessons = useMemo(
    () => expandLessons(data.slots || [], { from: range.from, to: range.to, year: data.year, holidays }),
    [data.slots, range.from, range.to, data.year, holidays],
  );
  const canPrev = view !== 'year' && range.from > data.year.startDate;
  const canNext = view !== 'year' && range.to < data.year.endDate;
  const describe = (lesson) => `${classNames.get(lesson.classId) || 'Lớp'} · ${subjectNames.get(lesson.subjectId) || 'Môn học'}`;

  return (
    <div className="hr-stack">
      <div className="tc-view-tabs">
        <div className="hr-segment" role="group" aria-label="Dạng xem lịch dạy">
          {VIEWS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="tc-period-nav">
          {view !== 'year' ? (
            <button type="button" className="hr-icon-button" disabled={!canPrev} onClick={() => setAnchor((value) => shift(view, value, -1))} aria-label="Kỳ trước">
              <Icon name="chevronLeft" size={18} />
            </button>
          ) : null}
          <strong>{range.label}</strong>
          {view !== 'year' ? (
            <button type="button" className="hr-icon-button" disabled={!canNext} onClick={() => setAnchor((value) => shift(view, value, 1))} aria-label="Kỳ sau">
              <Icon name="chevronRight" size={18} />
            </button>
          ) : null}
          {view !== 'year' && anchor !== clampDate(today, data.year) ? (
            <button type="button" className="hr-button hr-button--ghost hr-button--sm" onClick={() => setAnchor(clampDate(today, data.year))}>
              Hôm nay
            </button>
          ) : null}
        </div>
      </div>

      {!(data.slots || []).length ? (
        <EmptyState icon="calendar" title="Chưa có lịch dạy trong năm học này.">
          Quản trị viên xếp lịch tại Thiết lập giáo viên hoặc Thiết lập lịch dạy.
        </EmptyState>
      ) : view === 'list' ? (
        <ListView lessons={lessons} describe={describe} today={today} />
      ) : view === 'week' ? (
        <WeekView from={range.from} lessons={lessons} holidays={holidays} year={data.year} classNames={classNames} subjectNames={subjectNames} />
      ) : view === 'month' ? (
        <MonthView from={range.from} to={range.to} lessons={lessons} holidays={holidays} year={data.year} classNames={classNames} today={today} />
      ) : (
        <SummaryView range={range} view={view} lessons={lessons} classNames={classNames} />
      )}
    </div>
  );
}

function ListView({ lessons, describe, today }) {
  const days = useMemo(() => {
    const map = new Map();
    for (const lesson of lessons) {
      if (!map.has(lesson.date)) map.set(lesson.date, []);
      map.get(lesson.date).push(lesson);
    }
    return [...map.entries()];
  }, [lessons]);
  if (!days.length) return <EmptyState icon="calendar" title="Không có tiết dạy trong tháng này." />;
  return (
    <div className="tc-lesson-list">
      {days.map(([date, rows]) => (
        <section key={date} className="tc-day">
          <h3>
            {WEEKDAY_LABELS[isoWeekday(date)]}, {formatDate(date)}
            <small>{date === today ? 'Hôm nay · ' : ''}{rows.length} tiết</small>
          </h3>
          {rows.map((lesson) => (
            <div key={`${lesson.session}-${lesson.period}`} className="tc-lesson">
              <b>{periodLabel(lesson)}</b>
              <span>{describe(lesson)}</span>
              <span>{lessonStartTime(lesson)}</span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function WeekView({ from, lessons, holidays, year, classNames, subjectNames }) {
  const dates = TIMETABLE_WEEKDAYS.map((weekday) => addDaysYmd(from, weekday - 1));
  const byKey = new Map(lessons.map((lesson) => [`${lesson.date}-${lesson.session}-${lesson.period}`, lesson]));
  return (
    <div className="tc-grid-wrap">
      <table className="tc-grid tc-week-grid">
        <thead>
          <tr>
            <th scope="col">Tiết</th>
            {dates.map((date) => (
              <th key={date} scope="col">
                {WEEKDAY_LABELS[isoWeekday(date)]}
                <br />
                {formatDate(date).slice(0, 5)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIMETABLE_SESSIONS.flatMap((session) =>
            TIMETABLE_PERIODS.map((period) => (
              <tr key={`${session}-${period}`} className={session === 'afternoon' && period === 1 ? 'tc-session-break' : undefined}>
                <th scope="row">
                  Tiết {period}
                  <small>{SESSION_LABELS[session]} · {lessonStartTime({ session, period })}</small>
                </th>
                {dates.map((date) => {
                  const off = holidays.has(date) || date < year.startDate || date > year.endDate;
                  const lesson = byKey.get(`${date}-${session}-${period}`);
                  return (
                    <td key={date}>
                      {lesson ? (
                        <div className="tc-cell is-mine">
                          <strong>{classNames.get(lesson.classId) || 'Lớp'}</strong>
                          <span>{subjectNames.get(lesson.subjectId) || ''}</span>
                        </div>
                      ) : off && period === 1 && session === 'morning' ? (
                        <div className="tc-cell is-blocked"><span>Nghỉ</span></div>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

function MonthView({ from, to, lessons, holidays, year, classNames, today }) {
  const byDate = new Map();
  for (const lesson of lessons) {
    if (!byDate.has(lesson.date)) byDate.set(lesson.date, []);
    byDate.get(lesson.date).push(lesson);
  }
  const cells = [];
  for (let date = weekStart(from); date <= to; date = addDaysYmd(date, 1)) {
    if (isoWeekday(date) > 5) continue;
    cells.push(date);
  }
  return (
    <div className="tc-grid-wrap" style={{ border: 0 }}>
      <div className="tc-month">
        {TIMETABLE_WEEKDAYS.map((weekday) => (
          <div key={weekday} className="tc-month-head">{WEEKDAY_LABELS[weekday]}</div>
        ))}
        {cells.map((date) => {
          const outside = date < from;
          const off = holidays.has(date) || date < year.startDate || date > year.endDate;
          const rows = byDate.get(date) || [];
          return (
            <div
              key={date}
              className={`tc-month-day${outside ? ' is-outside' : ''}${off ? ' is-off' : ''}${date === today ? ' is-today' : ''}`}
              aria-hidden={outside || undefined}
            >
              <strong>{Number(date.slice(8, 10))}</strong>
              {off ? <em>Nghỉ</em> : null}
              {rows.map((lesson) => (
                <span key={`${lesson.session}-${lesson.period}`}>
                  {lesson.session === 'morning' ? 'S' : 'C'}{lesson.period} · {classNames.get(lesson.classId) || 'Lớp'}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryView({ range, view, lessons, classNames }) {
  const months = [];
  for (let month = monthStart(range.from); month <= range.to; month = addMonthsYmd(month, 1)) months.push(month);
  const byClass = new Map();
  for (const lesson of lessons) byClass.set(lesson.classId, (byClass.get(lesson.classId) || 0) + 1);
  return (
    <div className="hr-stack">
      <div className="tc-summary-grid">
        <div className="tc-summary-card">
          <strong>{view === 'year' ? 'Cả năm học' : range.label}</strong>
          <b>{lessons.length} tiết</b>
          <ul>
            {[...byClass.entries()]
              .sort((a, b) => (classNames.get(a[0]) || '').localeCompare(classNames.get(b[0]) || '', 'vi', { numeric: true }))
              .map(([classId, count]) => (
                <li key={classId}>{classNames.get(classId) || 'Lớp'}: {count} tiết</li>
              ))}
          </ul>
        </div>
        {months.map((month) => {
          const own = lessons.filter((lesson) => lesson.date.startsWith(month.slice(0, 7)));
          const days = new Set(own.map((lesson) => lesson.date)).size;
          return (
            <div key={month} className="tc-summary-card">
              <strong>{monthLabel(month)}</strong>
              <b>{own.length} tiết</b>
              <ul>
                <li>{days} ngày có tiết dạy</li>
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
