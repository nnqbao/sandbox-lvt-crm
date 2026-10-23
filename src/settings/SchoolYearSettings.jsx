import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { vietnamTodayYmd } from '../homeroom/homeroomTime';
import { addDays, endOfMonth, formatDate, formatDateLong, isYmd, weekdayIndex, weekdayLabel } from '../homeroom/homeroomLabels';
import { Feedback, Icon, Modal, useAsyncTask } from '../homeroom/homeroomUi';
import { messageFor } from '../lib/appErrorMessage';
import { groupHolidayRuns, isWeekend, schoolYearStats, suggestVietnamHolidays, weekdaysBetween } from './schoolYearCalendar';
import './schoolYearSettings.css';

const WEEK_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const KIND_LABELS = { holiday: 'Ngày nghỉ lễ', extra_teaching: 'Ngày học bù', working: 'Ngày học' };
const HOLIDAY_PRESETS = ['Nghỉ Tết Nguyên đán', 'Nghỉ Tết Dương lịch', 'Nghỉ lễ 30/4 – 1/5', 'Nghỉ lễ Quốc khánh 2/9', 'Giỗ Tổ Hùng Vương', 'Nghỉ giữa học kỳ'];
const HOLIDAY_RANGE_MAX_DAYS = 92;

function shortDate(ymd) {
  return `${ymd.slice(8)}/${ymd.slice(5, 7)}`;
}

function rangeLabel(from, to) {
  return from === to ? formatDateLong(from) : `${weekdayLabel(from, true)} ${shortDate(from)} → ${weekdayLabel(to, true)} ${formatDate(to)}`;
}

function monthsOf(year) {
  const list = [];
  for (let month = `${year.startDate.slice(0, 7)}-01`; month <= year.endDate; month = addDays(endOfMonth(month), 1)) list.push(month);
  return list;
}

function yearPhase(year, today) {
  if (today < year.startDate) return { key: 'upcoming', label: 'Sắp tới', progress: 0 };
  if (today > year.endDate) return { key: 'past', label: 'Đã kết thúc', progress: 100 };
  const total = Date.parse(year.endDate) - Date.parse(year.startDate);
  const done = Date.parse(today) - Date.parse(year.startDate);
  return { key: 'now', label: 'Đang diễn ra', progress: total > 0 ? Math.round((done / total) * 100) : 100 };
}

function Star({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m12 3.2 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z" />
    </svg>
  );
}

function Sparkle({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M6.3 17.7l2.4-2.4M15.3 8.7l2.4-2.4" />
    </svg>
  );
}

export default function SchoolYearSettings() {
  const years = useQuery(anyApi.schoolYears.list, {});
  const [selectedId, setSelectedId] = useState('');
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState('');
  const today = vietnamTodayYmd();

  if (years === undefined) {
    return (
      <section className="sy-view">
        <p className="sy-loading">Đang tải danh sách năm học…</p>
      </section>
    );
  }

  const selected = years.find((row) => row._id === selectedId) || years.find((row) => row.active) || years[0];
  const defaultYear = years.find((row) => row.active);

  return (
    <section className="sy-view">
      <header className="sy-hero">
        <div className="sy-hero-text">
          <span className="sy-eyebrow">Thiết lập tối cao · Lớp chủ nhiệm</span>
          <h2>Thiết lập năm học</h2>
          <p>
            Tạo các năm học, chọn <strong>năm học mặc định</strong> cho menu Lớp chủ nhiệm và đánh dấu các ngày nghỉ lễ.
            Ngày nghỉ không tính là ngày học nên hệ thống sẽ không nhắc thiếu điểm danh.
          </p>
        </div>
        <div className={`sy-hero-default${defaultYear ? '' : ' is-missing'}`}>
          <span>Lớp chủ nhiệm đang mở</span>
          <strong>{defaultYear ? defaultYear.name : 'Chưa chọn'}</strong>
          <small>
            {defaultYear
              ? `${formatDate(defaultYear.startDate)} – ${formatDate(defaultYear.endDate)}`
              : 'Hãy chọn một năm học làm mặc định'}
          </small>
        </div>
      </header>

      {notice ? <Feedback success={notice} /> : null}

      {!selected ? (
        <div className="sy-first-run">
          <span className="sy-first-icon"><Icon name="calendar" size={30} /></span>
          <h3>Chưa có năm học nào</h3>
          <p>Bắt đầu bằng việc tạo năm học đầu tiên. Mặc định Thứ 2 – Thứ 6 là ngày học; sau đó thầy cô có thể thêm các ngày nghỉ lễ.</p>
          <button type="button" className="primary-button" onClick={() => setModal({ kind: 'create' })}>
            <Icon name="plus" size={16} /> Tạo năm học đầu tiên
          </button>
        </div>
      ) : (
        <div className="sy-layout">
          <aside className="sy-rail" aria-label="Danh sách năm học">
            <div className="sy-rail-head">
              <h3>Danh sách năm học <span>{years.length}</span></h3>
              <button type="button" className="sy-add" onClick={() => setModal({ kind: 'create' })}>
                <Icon name="plus" size={15} /> Thêm
              </button>
            </div>
            <ol className="sy-year-list">
              {years.map((year, index) => {
                const phase = yearPhase(year, today);
                return (
                  <li key={year._id} style={{ animationDelay: `${index * 55}ms` }}>
                    <button
                      type="button"
                      className={`sy-year-tab is-${phase.key}`}
                      aria-current={selected._id === year._id ? 'true' : undefined}
                      onClick={() => setSelectedId(year._id)}
                    >
                      <span className="sy-year-top">
                        <span className="sy-year-name">{year.name}</span>
                        {year.active ? <span className="sy-flag sy-flag--default"><Star size={11} /> Mặc định</span> : null}
                      </span>
                      <span className="sy-year-range">{formatDate(year.startDate)} – {formatDate(year.endDate)}</span>
                      <span className="sy-year-meta">
                        <span className={`sy-phase is-${phase.key}`}>{phase.label}</span>
                        {year.lockedAt ? <span className="sy-phase is-locked">Đã khóa</span> : null}
                      </span>
                      <span className="sy-year-progress" aria-hidden="true"><i style={{ width: `${phase.progress}%` }} /></span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
          <YearDetail key={selected._id} year={selected} today={today} onEdit={() => setModal({ kind: 'edit', year: selected })} />
        </div>
      )}

      {modal?.kind === 'create' ? (
        <YearFormModal
          latest={years[0]}
          isFirst={!years.length}
          onClose={() => setModal(null)}
          onSaved={(id) => {
            setNotice('');
            setSelectedId(String(id));
          }}
        />
      ) : null}
      {modal?.kind === 'edit' ? (
        <YearFormModal
          year={modal.year}
          onClose={() => setModal(null)}
          onDeleted={(name) => {
            setSelectedId('');
            setNotice(`Đã xoá năm học ${name}.`);
          }}
        />
      ) : null}
    </section>
  );
}

function YearDetail({ year, today, onEdit }) {
  const data = useQuery(anyApi.schoolYears.listCalendarDays, { schoolYearId: year._id });
  const setDefault = useMutation(anyApi.schoolYears.setDefault);
  const removeDays = useMutation(anyApi.schoolYears.removeCalendarDays);
  const task = useAsyncTask();
  const [modal, setModal] = useState(null);
  const locked = Boolean(year.lockedAt);
  const days = useMemo(() => data?.days || [], [data]);
  const byDate = useMemo(() => new Map(days.map((row) => [row.date, row])), [days]);
  const runs = useMemo(() => groupHolidayRuns(days), [days]);
  const extraDays = days.filter((row) => row.kind !== 'holiday');
  const stats = useMemo(() => schoolYearStats(year, days), [year, days]);
  const nextRun = runs.find((run) => run.to >= today);

  return (
    <div className="sy-detail">
      <section className="sy-card sy-summary">
        <div className="sy-summary-top">
          <div className="sy-summary-main">
            <span className="sy-eyebrow">Năm học</span>
            <h3 className="sy-summary-name">{year.name}</h3>
            <p className="sy-summary-range">
              <Icon name="calendar" size={15} /> {formatDateLong(year.startDate)} <span aria-hidden="true">→</span> {formatDateLong(year.endDate)}
            </p>
          </div>
          <div className="sy-summary-actions">
            {year.active ? (
              <span className="sy-default-badge"><Star /> Mặc định của Lớp chủ nhiệm</span>
            ) : (
              <button
                type="button"
                className="primary-button sy-default-button"
                disabled={task.pending}
                onClick={() => task.run(() => setDefault({ id: year._id }), `Đã đặt ${year.name} làm năm học mặc định. Lớp chủ nhiệm sẽ mở năm học này.`)}
              >
                <Star /> Đặt làm mặc định
              </button>
            )}
            {!locked ? (
              <button type="button" className="hr-button" onClick={onEdit}>
                <Icon name="edit" size={15} /> Sửa thông tin
              </button>
            ) : null}
          </div>
        </div>
        <dl className="sy-stats">
          <div>
            <dt>Ngày học</dt>
            <dd>{data ? stats.schoolDays : '…'}</dd>
            <small>trong {stats.weeks} tuần</small>
          </div>
          <div className="is-holiday">
            <dt>Ngày nghỉ lễ</dt>
            <dd>{data ? stats.holidays : '…'}</dd>
            <small>{runs.length} đợt nghỉ</small>
          </div>
          <div className="is-extra">
            <dt>Ngày học bù</dt>
            <dd>{data ? stats.extra : '…'}</dd>
            <small>Thứ 7 / Chủ nhật</small>
          </div>
          <div>
            <dt>Bắt đầu học kỳ II</dt>
            <dd>{year.semester2StartDate ? formatDate(year.semester2StartDate) : 'Chưa đặt'}</dd>
            <small>dùng để chia điểm Học bạ</small>
          </div>
          <div>
            <dt>Giờ nhắc điểm danh</dt>
            <dd>{year.attendanceUploadDueTime}</dd>
            <small>quá giờ chưa có dữ liệu sẽ báo đỏ</small>
          </div>
        </dl>
        {locked ? <p className="sy-locked"><Icon name="alert" size={15} /> Năm học đã khóa — chỉ xem, không chỉnh sửa.</p> : null}
        <Feedback error={task.error} success={task.success} />
      </section>

      <section className="sy-card">
        <header className="sy-card-head">
          <div>
            <h3>Ngày nghỉ lễ</h3>
            <p>Các đợt nghỉ trong năm học. Chỉ cần đánh dấu Thứ 2 – Thứ 6, cuối tuần vốn đã nghỉ.</p>
          </div>
          {!locked ? (
            <div className="sy-card-tools">
              <button type="button" className="hr-button sy-suggest-button" onClick={() => setModal({ kind: 'suggest' })}>
                <Sparkle /> Gợi ý ngày lễ Việt Nam
              </button>
              <button type="button" className="primary-button" onClick={() => setModal({ kind: 'holiday' })}>
                <Icon name="plus" size={15} /> Thêm đợt nghỉ
              </button>
            </div>
          ) : null}
        </header>

        {data === undefined ? (
          <p className="sy-loading">Đang tải lịch nghỉ…</p>
        ) : !runs.length ? (
          <div className="sy-empty">
            <Sparkle size={22} />
            <div>
              <strong>Chưa có ngày nghỉ lễ nào</strong>
              <p>Bấm <em>Gợi ý ngày lễ Việt Nam</em> để thêm nhanh Tết, Giỗ Tổ, 30/4 – 1/5… hoặc tự thêm một đợt nghỉ.</p>
            </div>
          </div>
        ) : (
          <ol className="sy-runs">
            {runs.map((run, index) => {
              const past = run.to < today;
              const next = run === nextRun;
              return (
                <li key={run.from} className={`sy-run${past ? ' is-past' : ''}${next ? ' is-next' : ''}`} style={{ animationDelay: `${index * 45}ms` }}>
                  <div className="sy-run-date" aria-hidden="true">
                    <span className="sy-run-month">Tháng {Number(run.from.slice(5, 7))}</span>
                    <strong>{run.from.slice(8)}</strong>
                    <span className="sy-run-weekday">{run.from === run.to ? weekdayLabel(run.from, true) : `→ ${shortDate(run.to)}`}</span>
                  </div>
                  <div className="sy-run-body">
                    <strong>{run.note || 'Ngày nghỉ'}</strong>
                    <span>{rangeLabel(run.from, run.to)}</span>
                    <span className="sy-run-tags">
                      <em>{run.dates.length} ngày nghỉ</em>
                      {next ? <em className="is-next">Sắp tới</em> : null}
                      {past ? <em className="is-past">Đã qua</em> : null}
                    </span>
                  </div>
                  {!locked ? (
                    <div className="sy-run-actions">
                      <button type="button" className="hr-icon-button" aria-label={`Sửa đợt ${run.note || 'nghỉ'}`} title="Sửa đợt nghỉ" onClick={() => setModal({ kind: 'holiday', run })}>
                        <Icon name="edit" size={16} />
                      </button>
                      <button
                        type="button"
                        className="hr-icon-button hr-icon-button--danger"
                        aria-label={`Xóa đợt ${run.note || 'nghỉ'}`}
                        title="Xóa đợt nghỉ"
                        disabled={task.pending}
                        onClick={() => {
                          if (!window.confirm(`Xóa đợt "${run.note || 'Ngày nghỉ'}" (${run.dates.length} ngày)?\nCác ngày này sẽ trở lại là ngày học bình thường.`)) return;
                          void task.run(() => removeDays({ schoolYearId: year._id, dates: run.dates }), 'Đã xóa đợt nghỉ.');
                        }}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}

        {extraDays.length ? (
          <div className="sy-extra">
            <h4>Ngày học bù <span>{extraDays.length}</span></h4>
            <ul>
              {extraDays.map((row) => (
                <li key={row._id}>
                  <button type="button" disabled={locked} onClick={() => setModal({ kind: 'day', date: row.date })}>
                    <strong>{weekdayLabel(row.date, true)} {formatDate(row.date)}</strong>
                    {row.note ? <span>{row.note}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="sy-card">
        <header className="sy-card-head">
          <div>
            <h3>Lịch toàn năm</h3>
            <p>{locked ? 'Xem nhanh toàn bộ năm học.' : 'Bấm vào một ngày để đánh dấu nghỉ lễ (ngày thường) hoặc học bù (cuối tuần).'}</p>
          </div>
          <div className="sy-legend" aria-label="Chú thích">
            <span><i className="is-school" /> Ngày học</span>
            <span><i className="is-weekend" /> Cuối tuần</span>
            <span><i className="is-holiday" /> Nghỉ lễ</span>
            <span><i className="is-extra" /> Học bù</span>
          </div>
        </header>
        <div className="sy-months">
          {monthsOf(year).map((month) => (
            <MiniMonth
              key={month}
              month={month}
              year={year}
              byDate={byDate}
              today={today}
              locked={locked || data === undefined}
              onPick={(date) => setModal({ kind: 'day', date })}
            />
          ))}
        </div>
      </section>

      {modal?.kind === 'holiday' ? <HolidayModal year={year} run={modal.run} onClose={() => setModal(null)} /> : null}
      {modal?.kind === 'suggest' ? <SuggestModal year={year} days={days} onClose={() => setModal(null)} /> : null}
      {modal?.kind === 'day' ? <DayModal yearId={year._id} date={modal.date} row={byDate.get(modal.date)} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

function MiniMonth({ month, year, byDate, today, locked, onPick }) {
  const end = endOfMonth(month);
  const cells = Array.from({ length: (weekdayIndex(month) + 6) % 7 }, () => null);
  for (let day = month; day <= end; day = addDays(day, 1)) cells.push(day);
  let holidays = 0;
  for (const day of cells) if (day && byDate.get(day)?.kind === 'holiday' && !isWeekend(day)) holidays += 1;

  return (
    <div className="sy-month">
      <h4>
        Tháng {Number(month.slice(5, 7))} <span>{month.slice(0, 4)}</span>
        {holidays ? <em>{holidays} ngày nghỉ</em> : null}
      </h4>
      <div className="sy-month-grid" role="grid" aria-label={`Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`}>
        {WEEK_HEADERS.map((label) => (
          <span key={label} className="sy-month-head" role="columnheader">{label}</span>
        ))}
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} />;
          const outside = day < year.startDate || day > year.endDate;
          const row = byDate.get(day);
          const kind = outside ? 'outside' : row?.kind === 'holiday' ? 'holiday' : row ? 'extra' : isWeekend(day) ? 'weekend' : 'school';
          const label = outside ? 'ngoài năm học' : row ? `${KIND_LABELS[row.kind]}${row.note ? ` — ${row.note}` : ''}` : isWeekend(day) ? 'cuối tuần' : 'ngày học';
          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              className={`sy-day is-${kind}${day === today ? ' is-today' : ''}`}
              disabled={outside || locked}
              onClick={() => onPick(day)}
              title={`${formatDateLong(day)}: ${label}`}
              aria-label={`${formatDateLong(day)}: ${label}`}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function HolidayModal({ year, run = undefined, onClose }) {
  const save = useMutation(anyApi.schoolYears.setHolidayRange);
  const [note, setNote] = useState(run?.note || '');
  const [from, setFrom] = useState(run?.from || '');
  const [to, setTo] = useState(run?.to || '');
  const task = useAsyncTask();
  const ordered = isYmd(from) && isYmd(to) && from <= to;
  const inside = ordered && from >= year.startDate && to <= year.endDate;
  const tooLong = ordered && addDays(from, HOLIDAY_RANGE_MAX_DAYS - 1) < to;
  const dates = inside && !tooLong ? weekdaysBetween(from, to) : [];

  return (
    <Modal
      title={run ? 'Sửa đợt nghỉ' : 'Thêm đợt nghỉ lễ'}
      subtitle={`Năm học ${year.name} · ${formatDate(year.startDate)} – ${formatDate(year.endDate)}`}
      onClose={onClose}
      busy={task.pending}
      footer={
        <>
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Hủy</button>
          <button type="submit" form="sy-holiday-form" className="primary-button" disabled={task.pending || !dates.length || !note.trim()}>
            {task.pending ? 'Đang lưu…' : dates.length ? `Lưu ${dates.length} ngày nghỉ` : 'Lưu đợt nghỉ'}
          </button>
        </>
      }
    >
      <form
        id="sy-holiday-form"
        className="hr-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const outcome = await task.run(() =>
            save({ schoolYearId: year._id, from, to, note: note.trim(), replaceDates: run?.dates }),
          );
          if (outcome.ok) onClose();
        }}
      >
        <label className="hr-field">
          <span>Tên đợt nghỉ</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={120} placeholder="Ví dụ: Nghỉ Tết Nguyên đán" required />
        </label>
        <div className="sy-presets" aria-label="Tên gợi ý">
          {HOLIDAY_PRESETS.map((preset) => (
            <button key={preset} type="button" className={note === preset ? 'is-on' : ''} onClick={() => setNote(preset)}>{preset}</button>
          ))}
        </div>
        <div className="hr-form-grid">
          <label className="hr-field">
            <span>Từ ngày</span>
            <input
              type="date"
              value={from}
              min={year.startDate}
              max={year.endDate}
              onChange={(event) => {
                const next = event.target.value;
                setFrom(next);
                if (isYmd(next) && (!isYmd(to) || to < next)) setTo(next);
              }}
              required
            />
          </label>
          <label className="hr-field">
            <span>Đến ngày</span>
            <input type="date" value={to} min={from || year.startDate} max={year.endDate} onChange={(event) => setTo(event.target.value)} required />
          </label>
        </div>
        {ordered && !inside ? <p className="hr-alert hr-alert--error">Khoảng ngày phải nằm trong năm học ({formatDate(year.startDate)} – {formatDate(year.endDate)}).</p> : null}
        {tooLong ? <p className="hr-alert hr-alert--error">Mỗi đợt nghỉ tối đa {HOLIDAY_RANGE_MAX_DAYS} ngày. Hãy chia thành nhiều đợt.</p> : null}
        {inside && !tooLong ? (
          <div className="sy-preview">
            <strong>{dates.length ? `Sẽ đánh dấu ${dates.length} ngày nghỉ` : 'Khoảng này chỉ gồm cuối tuần — không cần đánh dấu.'}</strong>
            {dates.length ? (
              <ul>
                {dates.slice(0, 24).map((day) => <li key={day}>{weekdayLabel(day, true)} {shortDate(day)}</li>)}
                {dates.length > 24 ? <li>+{dates.length - 24} ngày</li> : null}
              </ul>
            ) : null}
          </div>
        ) : null}
        <Feedback error={task.error} />
      </form>
    </Modal>
  );
}

function SuggestModal({ year, days, onClose }) {
  const save = useMutation(anyApi.schoolYears.setHolidayRange);
  const task = useAsyncTask();
  const [progress, setProgress] = useState('');
  const [rows, setRows] = useState(() => {
    const marked = new Set(days.filter((row) => row.kind === 'holiday').map((row) => row.date));
    return suggestVietnamHolidays(year.startDate, year.endDate).map((item) => {
      const weekdays = weekdaysBetween(item.from, item.to);
      const already = weekdays.length > 0 && weekdays.every((day) => marked.has(day));
      return { ...item, already, checked: !already && weekdays.length > 0 };
    });
  });
  const patch = (key, changes) => setRows((list) => list.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  const rowDates = (row) => (isYmd(row.from) && isYmd(row.to) && row.from <= row.to ? weekdaysBetween(row.from, row.to) : []);
  const chosen = rows.filter((row) => row.checked && rowDates(row).length);

  return (
    <Modal
      title="Gợi ý ngày lễ Việt Nam"
      subtitle="Ngày âm lịch đã được quy đổi tự động. Thầy cô kiểm tra, chỉnh ngày nghỉ theo kế hoạch của trường rồi bấm Thêm."
      size="lg"
      onClose={onClose}
      busy={task.pending}
      footer={
        <>
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Đóng</button>
          <button type="submit" form="sy-suggest-form" className="primary-button" disabled={task.pending || !chosen.length}>
            {task.pending ? progress || 'Đang lưu…' : `Thêm ${chosen.length} đợt nghỉ`}
          </button>
        </>
      }
    >
      <form
        id="sy-suggest-form"
        className="hr-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const outcome = await task.run(async () => {
            for (let i = 0; i < chosen.length; i += 1) {
              setProgress(`Đang lưu ${i + 1}/${chosen.length}…`);
              await save({ schoolYearId: year._id, from: chosen[i].from, to: chosen[i].to, note: chosen[i].name });
            }
          });
          if (outcome.ok) onClose();
        }}
      >
        {!rows.length ? <p className="sy-muted">Không có ngày lễ nào rơi vào thời gian của năm học này.</p> : null}
        <ul className="sy-suggest-list">
          {rows.map((row) => {
            const count = rowDates(row).length;
            return (
              <li key={row.key} className={row.checked ? 'is-on' : ''}>
                <label className="sy-suggest-check">
                  <input type="checkbox" checked={row.checked} disabled={!count} onChange={(event) => patch(row.key, { checked: event.target.checked })} />
                  <span>
                    <strong>{row.name}</strong>
                    <small>{row.hint}</small>
                  </span>
                </label>
                <div className="sy-suggest-dates">
                  <input type="date" aria-label={`${row.name}: từ ngày`} value={row.from} min={year.startDate} max={year.endDate} onChange={(event) => patch(row.key, { from: event.target.value })} />
                  <span aria-hidden="true">→</span>
                  <input type="date" aria-label={`${row.name}: đến ngày`} value={row.to} min={row.from || year.startDate} max={year.endDate} onChange={(event) => patch(row.key, { to: event.target.value })} />
                </div>
                <span className="sy-suggest-status">
                  {row.already ? <em className="is-done">Đã có trong lịch</em> : !count ? <em>Rơi vào cuối tuần</em> : <em className="is-count">{count} ngày nghỉ</em>}
                </span>
              </li>
            );
          })}
        </ul>
        <Feedback error={task.error} />
      </form>
    </Modal>
  );
}

function DayModal({ yearId, date, row = undefined, onClose }) {
  const upsert = useMutation(anyApi.schoolYears.upsertCalendarDay);
  const remove = useMutation(anyApi.schoolYears.removeCalendarDay);
  const weekend = isWeekend(date);
  const targetKind = row?.kind || (weekend ? 'extra_teaching' : 'holiday');
  const [note, setNote] = useState(row?.note || '');
  const task = useAsyncTask();

  return (
    <Modal
      title={formatDateLong(date)}
      subtitle={row ? `Hiện là: ${KIND_LABELS[row.kind]}` : `Mặc định: ${weekend ? 'Cuối tuần (nghỉ)' : 'Ngày học bình thường'}`}
      onClose={onClose}
      busy={task.pending}
      size="sm"
      footer={
        <>
          {row ? (
            <button
              type="button"
              className="hr-button hr-button--danger-ghost hr-push-left"
              disabled={task.pending}
              onClick={async () => {
                const outcome = await task.run(() => remove({ schoolYearId: yearId, date }));
                if (outcome.ok) onClose();
              }}
            >
              Bỏ đánh dấu
            </button>
          ) : null}
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Hủy</button>
          <button type="submit" form="sy-day-form" className="primary-button" disabled={task.pending}>
            {task.pending ? 'Đang lưu…' : row ? 'Lưu ghi chú' : weekend ? 'Đánh dấu học bù' : 'Đánh dấu nghỉ lễ'}
          </button>
        </>
      }
    >
      <form
        id="sy-day-form"
        className="hr-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const outcome = await task.run(() => upsert({ schoolYearId: yearId, date, kind: targetKind, note: note.trim() || undefined }));
          if (outcome.ok) onClose();
        }}
      >
        <div className={`sy-day-kind is-${targetKind === 'holiday' ? 'holiday' : 'extra'}`}>
          <strong>{KIND_LABELS[targetKind]}</strong>
          <span>
            {targetKind === 'holiday'
              ? 'Không tính là ngày học, hệ thống không nhắc thiếu file điểm danh.'
              : 'Tính là ngày học, hệ thống sẽ nhắc nếu chưa có file điểm danh.'}
          </span>
        </div>
        <label className="hr-field">
          <span>Ghi chú</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={120}
            placeholder={targetKind === 'holiday' ? 'Ví dụ: Nghỉ lễ Quốc khánh' : 'Ví dụ: Học bù cho ngày 2/9'}
          />
        </label>
        <Feedback error={task.error} />
      </form>
    </Modal>
  );
}

function YearFormModal({ year = undefined, latest = undefined, isFirst = false, onClose, onSaved = undefined, onDeleted = undefined }) {
  const create = useMutation(anyApi.schoolYears.create);
  const update = useMutation(anyApi.schoolYears.update);
  const removeYear = useMutation(anyApi.schoolYears.remove);
  const removal = useQuery(anyApi.schoolYears.removalCheck, year ? { id: year._id } : 'skip');
  const task = useAsyncTask();
  const deleteTask = useAsyncTask();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nameTouched, setNameTouched] = useState(Boolean(year));
  const [form, setForm] = useState(() => {
    if (year) {
      return {
        name: year.name,
        startDate: year.startDate,
        endDate: year.endDate,
        attendanceUploadDueTime: year.attendanceUploadDueTime || '08:30',
        semester2StartDate: year.semester2StartDate || '',
      };
    }
    const today = vietnamTodayYmd();
    const startYear = latest ? Number(latest.endDate.slice(0, 4)) : Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 8 ? 1 : 0);
    return {
      name: `${startYear}-${startYear + 1}`,
      startDate: `${startYear}-09-05`,
      endDate: `${startYear + 1}-05-31`,
      attendanceUploadDueTime: latest?.attendanceUploadDueTime || '08:30',
      semester2StartDate: `${startYear + 1}-01-12`,
      active: isFirst,
    };
  });
  const setDate = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (!nameTouched && isYmd(next.startDate) && isYmd(next.endDate)) next.name = `${next.startDate.slice(0, 4)}-${next.endDate.slice(0, 4)}`;
      return next;
    });
  };
  const semester2Valid =
    !form.semester2StartDate
    || (isYmd(form.semester2StartDate) && form.semester2StartDate > form.startDate && form.semester2StartDate <= form.endDate);
  const valid = isYmd(form.startDate) && isYmd(form.endDate) && form.startDate <= form.endDate && semester2Valid;
  const preview = valid ? schoolYearStats(form, []) : null;
  const deleteBlocker = year ? (year.active ? 'SCHOOL_YEAR_DELETE_DEFAULT' : removal?.blocker || '') : '';
  const deleteReason = deleteBlocker ? messageFor(deleteBlocker) : '';
  const busy = task.pending || deleteTask.pending;

  if (year && confirmDelete) {
    const calendarDays = removal?.calendarDays || 0;
    return (
      <Modal
        key="confirm-delete"
        title={`Xoá năm học ${year.name}?`}
        subtitle={`${formatDate(year.startDate)} – ${formatDate(year.endDate)}`}
        size="sm"
        onClose={() => setConfirmDelete(false)}
        busy={deleteTask.pending}
        footer={
          <>
            <button type="button" className="hr-button hr-button--ghost" onClick={() => setConfirmDelete(false)} disabled={deleteTask.pending}>
              Hủy
            </button>
            <button
              type="button"
              className="hr-button sy-confirm-delete-button"
              disabled={deleteTask.pending || Boolean(deleteBlocker)}
              onClick={async () => {
                const outcome = await deleteTask.run(() => removeYear({ id: year._id }));
                if (!outcome.ok) return;
                onDeleted?.(year.name);
                onClose();
              }}
            >
              <Icon name="trash" size={15} /> {deleteTask.pending ? 'Đang xoá…' : 'Xoá vĩnh viễn'}
            </button>
          </>
        }
      >
        <div className="hr-form">
          <div className="sy-delete-warning">
            <Icon name="alert" size={18} />
            <p>
              Năm học <strong>{year.name}</strong> sẽ bị xoá vĩnh viễn
              {calendarDays ? <>, cùng <strong>{calendarDays} ngày nghỉ lễ / học bù</strong> đã đánh dấu</> : null}. Thao tác này không thể hoàn tác.
            </p>
          </div>
          <Feedback error={deleteTask.error || (deleteTask.pending ? '' : deleteReason)} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      key="year-form"
      title={year ? `Sửa năm học ${year.name}` : 'Thêm năm học mới'}
      subtitle={year ? 'Các ngày nghỉ đã đánh dấu vẫn được giữ nguyên.' : 'Mặc định Thứ 2 – Thứ 6 là ngày học. Ngày nghỉ lễ thêm sau khi tạo.'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          {year ? (
            <button
              type="button"
              className="hr-button sy-delete-button hr-push-left"
              disabled={busy || removal === undefined || Boolean(deleteBlocker)}
              title={deleteReason || 'Xoá năm học này'}
              onClick={() => {
                deleteTask.reset();
                setConfirmDelete(true);
              }}
            >
              <Icon name="trash" size={15} /> Xoá năm học
            </button>
          ) : null}
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={busy}>Hủy</button>
          <button type="submit" form="sy-year-form" className="primary-button" disabled={busy || !valid}>
            {task.pending ? 'Đang lưu…' : year ? 'Lưu thay đổi' : 'Tạo năm học'}
          </button>
        </>
      }
    >
      <form
        id="sy-year-form"
        className="hr-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const outcome = await task.run(() =>
            year
              ? update({
                  id: year._id,
                  name: form.name,
                  startDate: form.startDate,
                  endDate: form.endDate,
                  attendanceUploadDueTime: form.attendanceUploadDueTime,
                  semester2StartDate: form.semester2StartDate || '',
                })
              : create(form),
          );
          if (!outcome.ok) return;
          if (!year) onSaved?.(outcome.result);
          onClose();
        }}
      >
        <div className="hr-form-grid">
          <label className="hr-field">
            <span>Ngày bắt đầu</span>
            <input type="date" value={form.startDate} onChange={setDate('startDate')} required />
          </label>
          <label className="hr-field">
            <span>Ngày kết thúc</span>
            <input type="date" value={form.endDate} min={form.startDate} onChange={setDate('endDate')} required />
          </label>
          <label className="hr-field">
            <span>Tên năm học</span>
            <input
              value={form.name}
              maxLength={40}
              onChange={(event) => {
                setNameTouched(true);
                setForm((current) => ({ ...current, name: event.target.value }));
              }}
              placeholder="Ví dụ: 2026-2027"
              required
            />
          </label>
          <label className="hr-field">
            <span>Giờ nhắc thiếu điểm danh</span>
            <input type="time" value={form.attendanceUploadDueTime} onChange={(event) => setForm((current) => ({ ...current, attendanceUploadDueTime: event.target.value }))} />
          </label>
          <label className="hr-field">
            <span>Ngày bắt đầu học kỳ II</span>
            <input
              type="date"
              value={form.semester2StartDate}
              min={form.startDate}
              max={form.endDate}
              onChange={(event) => setForm((current) => ({ ...current, semester2StartDate: event.target.value }))}
            />
          </label>
        </div>
        {!semester2Valid ? (
          <p className="hr-alert hr-alert--error">Ngày bắt đầu học kỳ II phải sau ngày bắt đầu và không muộn hơn ngày kết thúc năm học.</p>
        ) : null}
        {preview ? (
          <p className="sy-form-preview">
            <Icon name="calendar" size={15} /> {preview.weeks} tuần · khoảng <strong>{preview.schoolDays} ngày học</strong> (trước khi trừ ngày nghỉ lễ)
          </p>
        ) : null}
        {!year ? (
          <label className="hr-switch">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
            <span>Đặt làm năm học mặc định cho Lớp chủ nhiệm</span>
          </label>
        ) : null}
        {deleteReason ? (
          <p className="sy-delete-note">
            <Icon name="alert" size={15} />
            <span>{deleteReason}</span>
          </p>
        ) : null}
        <Feedback error={task.error} />
      </form>
    </Modal>
  );
}
