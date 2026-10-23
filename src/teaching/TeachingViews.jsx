import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { formatDate, formatDateTime } from '../homeroom/homeroomLabels';
import { EmptyState, Feedback, Icon, Loading, Modal, Notice, useAsyncTask } from '../homeroom/homeroomUi';
import {
  addDaysYmd,
  expandLessons,
  isoWeekday,
  lessonStartTime,
  nextLessonByClass,
  periodLabel,
  vietnamNowParts,
  WEEKDAY_LABELS,
  weekStart,
} from '../lib/teachingSchedule';
import ScheduleCalendar from './ScheduleCalendar';
import { Stars, subjectNameMap } from './teachingShared';
import './teaching.css';

function useTeaching(yearId) {
  const data = useQuery(anyApi.lessonLogs.myTeaching, { schoolYearId: yearId });
  const catalog = useQuery(anyApi.teachingCatalog.catalog, {});
  const subjectNames = useMemo(() => subjectNameMap(catalog), [catalog]);
  const holidays = useMemo(() => new Set(data?.holidays || []), [data?.holidays]);
  const classNames = useMemo(() => new Map((data?.classes || []).map((row) => [row._id, row.name])), [data?.classes]);
  return { data, catalog, subjectNames, holidays, classNames };
}

function absentCount(counts) {
  return (counts?.absent_pending || 0) + (counts?.absent_excused || 0) + (counts?.absent_unexcused || 0);
}

// ------------------------------------------------------------------ Tổng quan

/** Tổng quan Lớp học: tiết dạy hôm nay + tình hình vắng của lớp chủ nhiệm. */
export function TeachingOverview({ yearId, nav }) {
  const { data, subjectNames, holidays, classNames } = useTeaching(yearId);
  const now = vietnamNowParts();
  const overview = useQuery(anyApi.homeroomReports.overview, { schoolYearId: yearId, date: now.date });
  const todayLessons = useMemo(
    () => (data ? expandLessons(data.slots, { from: now.date, to: now.date, year: data.year, holidays }) : []),
    [data, holidays, now.date],
  );
  const logged = new Set((data?.todayLogs || []).map((row) => `${row.classId}-${row.session}-${row.period}`));

  return (
    <div className="tc-overview">
      <section className="hr-panel">
        <header className="hr-panel-head">
          <div>
            <span className="hr-eyebrow">Lớp giảng dạy</span>
            <h2>Tiết dạy hôm nay</h2>
            <p className="hr-muted">{WEEKDAY_LABELS[isoWeekday(now.date)]}, {formatDate(now.date)}</p>
          </div>
          <button type="button" className="hr-button" onClick={() => nav.section('teaching')}>
            Xem chi tiết <Icon name="arrowRight" size={15} />
          </button>
        </header>
        {data === undefined ? (
          <Loading label="Đang tải tiết dạy…" />
        ) : !todayLessons.length ? (
          <EmptyState icon="calendar" title="Hôm nay bạn không có tiết dạy.">
            {data.slots.length ? 'Xem lịch các ngày khác ở tab Lịch dạy.' : 'Bạn chưa được xếp lịch dạy trong năm học này.'}
          </EmptyState>
        ) : (
          <ul className="tc-today-list">
            {todayLessons.map((lesson) => {
              const done = logged.has(`${lesson.classId}-${lesson.session}-${lesson.period}`);
              return (
                <li key={`${lesson.session}-${lesson.period}`} className="tc-today-item">
                  <time>{lessonStartTime(lesson)}</time>
                  <div>
                    <strong>{classNames.get(lesson.classId) || 'Lớp'} · {subjectNames.get(lesson.subjectId) || 'Môn học'}</strong>
                    <span>{periodLabel(lesson)}</span>
                  </div>
                  <span className={`tc-chip ${done ? 'tc-chip--teal' : 'tc-chip--gold'}`}>{done ? 'Đã ghi sổ' : 'Chưa ghi sổ'}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="hr-panel">
        <header className="hr-panel-head">
          <div>
            <span className="hr-eyebrow">Lớp chủ nhiệm</span>
            <h2>Học sinh vắng hôm nay</h2>
            <p className="hr-muted">Vào lớp để đánh dấu vắng có phép hay không phép.</p>
          </div>
          <button type="button" className="hr-button" onClick={() => nav.section('homeroom')}>
            Xem chi tiết <Icon name="arrowRight" size={15} />
          </button>
        </header>
        {overview === undefined ? (
          <Loading label="Đang tải điểm danh…" />
        ) : overview.mode === 'school' ? (
          <div className="hr-stack hr-stack--tight">
            <p className="hr-lead">
              Toàn trường có <strong>{absentCount(overview.summary.counts)}</strong> học sinh vắng
              ({overview.summary.counts.absent_excused} có phép · {overview.summary.counts.absent_unexcused} không phép).
            </p>
            <p className="hr-muted">
              {overview.classes.filter((row) => row.saved).length}/{overview.classes.length} lớp đã được điểm danh.
            </p>
          </div>
        ) : !overview.classes.length ? (
          <EmptyState icon="classes" title="Bạn không chủ nhiệm lớp nào trong năm học này." />
        ) : (
          <ul className="tc-today-list">
            {overview.classes.map((row) => {
              const absent = absentCount(row.counts);
              return (
                <li key={row._id} className="tc-today-item">
                  <time>{row.name}</time>
                  <div>
                    <strong>{row.saved ? `${absent} em vắng` : 'Chưa điểm danh'}</strong>
                    <span>
                      {row.saved
                        ? `${row.counts.absent_excused} có phép · ${row.counts.absent_unexcused} không phép · sĩ số ${row.rosterCount}`
                        : `Sĩ số ${row.rosterCount}`}
                    </span>
                  </div>
                  <button type="button" className="hr-button hr-button--sm" onClick={() => nav.openClass(row._id, 'diem-danh')}>
                    Xem
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ Lớp giảng dạy

/** Lớp mình dạy, lớp sắp tới giờ dạy nhất ở trên cùng; bấm lớp để ghi Sổ đầu bài. */
export function TeachingClasses({ yearId }) {
  const { data, subjectNames, holidays } = useTeaching(yearId);
  const [open, setOpen] = useState(null);
  const now = vietnamNowParts();
  const rows = useMemo(() => {
    if (!data) return [];
    const lessons = expandLessons(data.slots, { from: now.date, to: addDaysYmd(now.date, 35), year: data.year, holidays });
    const next = nextLessonByClass(lessons, now);
    const subjectsByClass = new Map();
    for (const slot of data.slots) {
      if (!subjectsByClass.has(slot.classId)) subjectsByClass.set(slot.classId, new Set());
      subjectsByClass.get(slot.classId).add(slot.subjectId);
    }
    return data.classes
      .map((row) => ({ ...row, next: next.get(row._id) || null, subjectIds: [...(subjectsByClass.get(row._id) || [])] }))
      .sort((a, b) => {
        if (a.next && b.next) return `${a.next.date} ${lessonStartTime(a.next)}`.localeCompare(`${b.next.date} ${lessonStartTime(b.next)}`);
        if (a.next) return -1;
        if (b.next) return 1;
        return a.name.localeCompare(b.name, 'vi', { numeric: true });
      });
  }, [data, holidays, now.date, now.time]);

  if (data === undefined) return <Loading label="Đang tải lớp giảng dạy…" />;
  if (!data.classes.length) {
    return (
      <EmptyState icon="classes" title="Bạn chưa được xếp lịch dạy trong năm học này.">
        Quản trị viên xếp lịch tại Thiết lập giáo viên hoặc Thiết lập lịch dạy.
      </EmptyState>
    );
  }
  return (
    <div className="hr-stack">
      <p className="hr-muted">Bấm vào lớp để ghi Sổ đầu bài cho tiết vừa dạy. Giáo viên chủ nhiệm của lớp sẽ thấy đánh giá này.</p>
      <div className="hr-stack hr-stack--tight">
        {rows.map((row) => {
          const isToday = row.next?.date === now.date;
          return (
            <button key={row._id} type="button" className={`tc-teach-row${isToday ? ' is-now' : ''}`} onClick={() => setOpen(row)}>
              <div>
                <strong>{row.name}</strong>
                <span>{row.subjectIds.map((id) => subjectNames.get(id) || 'Môn học').join(', ')}</span>
                <span>
                  {row.next
                    ? `${isToday ? 'Hôm nay' : `${WEEKDAY_LABELS[isoWeekday(row.next.date)]}, ${formatDate(row.next.date)}`} · ${periodLabel(row.next)} · ${lessonStartTime(row.next)}`
                    : 'Không còn tiết nào trong 5 tuần tới'}
                </span>
              </div>
              <span className="hr-button hr-button--sm" aria-hidden="true">
                <Icon name="edit" size={14} /> Sổ đầu bài
              </span>
            </button>
          );
        })}
      </div>
      {open ? (
        <LessonLogModal
          klass={open}
          data={data}
          holidays={holidays}
          subjectNames={subjectNames}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function LessonLogModal({ klass, data, holidays, subjectNames, onClose }) {
  const now = vietnamNowParts();
  const today = now.date > data.year.endDate ? data.year.endDate : now.date;
  const [date, setDate] = useState(today);
  const lessons = useMemo(
    () => expandLessons(data.slots.filter((slot) => slot.classId === klass._id), { from: date, to: date, year: data.year, holidays }),
    [data, klass._id, date, holidays],
  );
  const existing = useQuery(anyApi.lessonLogs.myLogsFor, { classId: klass._id, date });
  const [cell, setCell] = useState('');
  const current = lessons.find((lesson) => `${lesson.session}-${lesson.period}` === cell)
    // Mặc định: tiết đang/vừa dạy (bắt đầu gần nhất trước giờ hiện tại), nếu không thì tiết đầu tiên.
    || [...lessons].reverse().find((lesson) => date < now.date || lessonStartTime(lesson) <= now.time)
    || lessons[0];
  const key = current ? `${current.session}-${current.period}` : '';
  const saved = (existing || []).find((row) => `${row.session}-${row.period}` === key);
  return (
    <LessonLogForm
      key={`${date}-${key}-${saved?._id || ''}`}
      klass={klass}
      date={date}
      setDate={setDate}
      minDate={data.year.startDate}
      maxDate={today}
      lessons={lessons}
      current={current}
      onPick={setCell}
      saved={saved}
      loadingSaved={existing === undefined}
      subjectNames={subjectNames}
      locked={data.year.locked}
      onClose={onClose}
    />
  );
}

function LessonLogForm({ klass, date, setDate, minDate, maxDate, lessons, current, onPick, saved, loadingSaved, subjectNames, locked, onClose }) {
  const save = useMutation(anyApi.lessonLogs.save);
  const task = useAsyncTask();
  const [rating, setRating] = useState(saved?.rating || 0);
  const [comment, setComment] = useState(saved?.comment || '');
  const canSave = Boolean(current) && rating > 0 && !locked && !loadingSaved;
  return (
    <Modal
      title={`Sổ đầu bài · ${klass.name}`}
      subtitle={current ? `${periodLabel(current)} · ${subjectNames.get(current.subjectId) || 'Môn học'} · ${formatDate(date)}` : formatDate(date)}
      onClose={onClose}
      busy={task.pending}
      footer={
        <>
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Đóng</button>
          <button
            type="button"
            className="primary-button"
            disabled={!canSave || task.pending}
            onClick={async () => {
              const outcome = await task.run(
                () => save({ classId: klass._id, date, session: current.session, period: current.period, rating, comment }),
                'Đã lưu Sổ đầu bài.',
              );
              if (outcome.ok) onClose();
            }}
          >
            {task.pending ? 'Đang lưu…' : 'Lưu'}
          </button>
        </>
      }
    >
      <div className="hr-form">
        <div className="hr-form-grid">
          <label className="hr-field">
            <span>Ngày dạy</span>
            <input type="date" value={date} min={minDate} max={maxDate} onChange={(event) => event.target.value && setDate(event.target.value)} />
          </label>
          <label className="hr-field">
            <span>Tiết</span>
            <select
              value={current ? `${current.session}-${current.period}` : ''}
              disabled={!lessons.length}
              onChange={(event) => onPick(event.target.value)}
            >
              {!lessons.length ? <option value="">Không có tiết</option> : null}
              {lessons.map((lesson) => (
                <option key={`${lesson.session}-${lesson.period}`} value={`${lesson.session}-${lesson.period}`}>
                  {periodLabel(lesson)} · {lessonStartTime(lesson)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!lessons.length ? (
          <Notice tone="info" icon="calendar" title="Ngày này bạn không có tiết ở lớp này.">Chọn ngày khác có tiết dạy để ghi sổ.</Notice>
        ) : null}
        {saved ? <p className="hr-hint"><Icon name="check" size={14} /> Đã ghi lúc {formatDateTime(saved.updatedAt)} — lưu lại để sửa.</p> : null}
        <div className="hr-field">
          <span id="tc-rating-label">Đánh giá tiết học</span>
          <div className="tc-stars" role="radiogroup" aria-labelledby="tc-rating-label">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-pressed={value <= rating}
                aria-label={`${value} sao`}
                disabled={!current || locked}
                onClick={() => setRating(value)}
              >
                ★
              </button>
            ))}
          </div>
        </div>
        <label className="hr-field">
          <span>Đánh giá tiết học (nhận xét)</span>
          <textarea
            className="tc-textarea"
            maxLength={1000}
            value={comment}
            disabled={!current || locked}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
        {locked ? <Notice tone="warn" icon="alert" title="Năm học đã khóa — không ghi thêm Sổ đầu bài." /> : null}
        <Feedback error={task.error} />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ Lịch dạy

export function MySchedule({ yearId }) {
  const data = useQuery(anyApi.teachers.schedule, { schoolYearId: yearId });
  const catalog = useQuery(anyApi.teachingCatalog.catalog, {});
  const subjectNames = useMemo(() => subjectNameMap(catalog), [catalog]);
  if (data === undefined || catalog === undefined) return <Loading label="Đang tải lịch dạy…" />;
  return <ScheduleCalendar key={data.year._id} data={data} subjectNames={subjectNames} />;
}

// ------------------------------------------------------------------ Sổ đầu bài của lớp (GVCN)

/** Tab "Sổ đầu bài" trong trang lớp: đánh giá tiết học của các giáo viên bộ môn, theo tuần. */
export function ClassLessonLogs({ classId }) {
  const today = vietnamNowParts().date;
  const [from, setFrom] = useState(() => weekStart(today));
  const to = addDaysYmd(from, 6);
  const rows = useQuery(anyApi.lessonLogs.listForClass, { classId, from, to });
  const average = rows?.length ? (rows.reduce((sum, row) => sum + row.rating, 0) / rows.length).toFixed(1).replace('.', ',') : '';
  return (
    <section className="hr-panel">
      <header className="hr-panel-head">
        <div>
          <h2>Sổ đầu bài</h2>
          <p className="hr-muted">Đánh giá lớp qua từng tiết học do giáo viên bộ môn ghi.{average ? ` Trung bình tuần: ${average}/5 sao.` : ''}</p>
        </div>
        <div className="tc-period-nav">
          <button type="button" className="hr-icon-button" onClick={() => setFrom(addDaysYmd(from, -7))} aria-label="Tuần trước">
            <Icon name="chevronLeft" size={18} />
          </button>
          <strong>{formatDate(from)} – {formatDate(to)}</strong>
          <button type="button" className="hr-icon-button" onClick={() => setFrom(addDaysYmd(from, 7))} disabled={to >= today} aria-label="Tuần sau">
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      </header>
      {rows === undefined ? (
        <Loading label="Đang tải Sổ đầu bài…" />
      ) : !rows.length ? (
        <EmptyState icon="file" title="Chưa có đánh giá tiết học trong tuần này." />
      ) : (
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th scope="col">Ngày</th>
                <th scope="col">Tiết</th>
                <th scope="col">Môn · Giáo viên</th>
                <th scope="col">Đánh giá</th>
                <th scope="col">Nhận xét</th>
                <th scope="col">Ghi lúc</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  <th scope="row">{WEEKDAY_LABELS[isoWeekday(row.date)]}, {formatDate(row.date)}</th>
                  <td>{periodLabel(row)}</td>
                  <td>
                    <strong>{row.subjectName}</strong>
                    <span className="hr-sub">{row.teacherName}</span>
                  </td>
                  <td><Stars value={row.rating} /></td>
                  <td className="hr-note-cell"><span className="tc-log-comment">{row.comment || '—'}</span></td>
                  <td>{formatDateTime(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
