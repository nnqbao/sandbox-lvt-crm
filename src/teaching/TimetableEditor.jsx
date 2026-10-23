import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { classLabel, formatDate } from '../homeroom/homeroomLabels';
import { EmptyState, Feedback, Icon, Loading, Notice, useAsyncTask } from '../homeroom/homeroomUi';
import {
  addDaysYmd,
  cellKey,
  isTimetableDay,
  lessonStartTime,
  SESSION_LABELS,
  slotCoversDate,
  TIMETABLE_PERIODS,
  TIMETABLE_SESSIONS,
  TIMETABLE_WEEKDAYS,
  WEEKDAY_LABELS,
} from '../lib/teachingSchedule';

const CELLS = TIMETABLE_SESSIONS.flatMap((session) => TIMETABLE_PERIODS.map((period) => ({ session, period })));

function clamp(date, year) {
  if (date < year.startDate) return year.startDate;
  if (date > year.endDate) return year.endDate;
  return date;
}

function countTeachingDays(from, year, holidays) {
  let count = 0;
  for (let date = from; date <= year.endDate; date = addDaysYmd(date, 1)) {
    if (isTimetableDay(date, year, holidays)) count += 1;
  }
  return count;
}

/**
 * Lưới thời khóa biểu tuần của một lớp (Thứ 2–6 × 5 tiết sáng + 5 tiết chiều).
 * mode "class": chọn giáo viên cho từng tiết. mode "teacher": tick các tiết của một giáo viên.
 * Thay đổi áp dụng cho mọi ngày học từ "Áp dụng từ ngày" đến hết năm học; lịch trước đó giữ nguyên.
 */
export default function TimetableEditor({ classId, mode = 'class', teacherId = '' }) {
  const data = useQuery(anyApi.timetable.classTimetable, { classId });
  if (data === undefined) return <Loading label="Đang tải lịch dạy của lớp…" />;
  return <Editor key={`${classId}-${teacherId}`} data={data} mode={mode} teacherId={teacherId} />;
}

function Editor({ data, mode, teacherId }) {
  const apply = useMutation(anyApi.timetable.applyChanges);
  const task = useAsyncTask();
  const { year } = data;
  const holidays = useMemo(() => new Set(data.holidays), [data.holidays]);
  const [effectiveFrom, setEffectiveFrom] = useState(() => clamp(data.today, year));
  const [draft, setDraft] = useState(() => new Map());
  const subjectNames = useMemo(() => new Map(data.subjects.map((row) => [row._id, row.name])), [data.subjects]);
  const teacher = data.teachers.find((row) => row._id === teacherId);
  const [teacherSubject, setTeacherSubject] = useState(() => {
    const used = data.slots.find((slot) => slot.teacherId === teacherId)?.subjectId;
    return used && teacher?.subjectIds.includes(used) ? used : teacher?.subjectIds[0] || '';
  });

  const baseline = useMemo(() => {
    const map = new Map();
    for (const slot of data.slots) if (slotCoversDate(slot, effectiveFrom)) map.set(cellKey(slot), slot);
    return map;
  }, [data.slots, effectiveFrom]);
  const futureVersions = data.slots.some((slot) => slot.effectiveFrom > effectiveFrom);
  const busyAt = useMemo(() => {
    // teacherId|cellKey → class name, for tiết the teacher already has in another class.
    const map = new Map();
    for (const row of data.busy) {
      if (row.effectiveTo && row.effectiveTo < effectiveFrom) continue;
      map.set(`${row.teacherId}|${cellKey(row)}`, data.classNames[row.classId] || 'lớp khác');
    }
    return map;
  }, [data.busy, data.classNames, effectiveFrom]);
  const teacherNames = useMemo(() => new Map(data.teachers.map((row) => [row._id, row.name])), [data.teachers]);

  const valueOf = (key) => (draft.has(key) ? draft.get(key) : baseline.get(key) || null);
  const changes = [...draft.entries()].filter(([key, next]) => {
    const base = baseline.get(key);
    return (base?.teacherId || '') !== (next?.teacherId || '') || (next && base?.subjectId !== next.subjectId);
  });
  const locked = year.locked || data.class.status === 'archived';
  const remainingDays = countTeachingDays(effectiveFrom, year, holidays);

  const setCell = (key, next) =>
    setDraft((current) => {
      const copy = new Map(current);
      copy.set(key, next);
      return copy;
    });

  const save = async () => {
    const payload = changes.map(([key, next]) => {
      const [weekday, session, period] = key.split('-');
      const base = baseline.get(key);
      return {
        weekday: Number(weekday),
        session,
        period: Number(period),
        ...(next ? { teacherId: next.teacherId, subjectId: next.subjectId } : {}),
        expectedTeacherId: base?.teacherId || '',
      };
    });
    const outcome = await task.run(
      () => apply({ classId: data.class._id, effectiveFrom, changes: payload }),
      `Đã lưu lịch dạy ${classLabel(data.class.name, { lower: true })}, áp dụng từ ${formatDate(effectiveFrom)}.`,
    );
    if (outcome.ok) setDraft(new Map());
  };

  if (mode === 'teacher' && !teacher) {
    return (
      <EmptyState icon="users" title="Giáo viên chưa có Môn giảng dạy hoặc chưa nhận lớp này.">
        Quay lại Thiết lập giáo viên, chọn Môn giảng dạy và Lớp giảng dạy cho giáo viên rồi thêm lịch dạy.
      </EmptyState>
    );
  }

  return (
    <div className="hr-stack">
      <Notice tone="info" icon="calendar" title={`${classLabel(data.class.name)} · Năm học ${year.name}`}>
        Thời gian học: {formatDate(year.startDate)} – {formatDate(year.endDate)}, Thứ 2 – Thứ 6, mỗi ngày 5 tiết sáng và 5 tiết chiều
        {data.holidays.length ? `, trừ ${data.holidays.length} ngày nghỉ lễ` : ''}. Lịch tuần bên dưới được áp dụng cho{' '}
        <strong>{remainingDays} ngày học</strong> từ {formatDate(effectiveFrom)} đến hết năm học; lịch các ngày trước đó giữ nguyên.
        Không bắt buộc xếp đủ cả 10 tiết.
      </Notice>
      {locked ? (
        <Notice tone="warn" icon="alert" title={year.locked ? 'Năm học đã khóa — chỉ xem.' : 'Lớp đã lưu trữ — chỉ xem.'} />
      ) : null}
      {mode === 'class' && !data.teachers.length ? (
        <Notice tone="warn" icon="users" title="Chưa có giáo viên nào nhận lớp này.">
          Vào Thiết lập giáo viên, bấm (+) ở cột Lớp giảng dạy để giao lớp cho giáo viên rồi quay lại xếp lịch.
        </Notice>
      ) : null}
      {futureVersions ? (
        <Notice tone="warn" icon="clock" title="Lớp có lịch đã hẹn đổi sau ngày đang chọn.">
          Lưu thay đổi sẽ thay toàn bộ lịch của các ô đã sửa từ {formatDate(effectiveFrom)} trở đi.
        </Notice>
      ) : null}

      {mode === 'teacher' ? (
        <div className="hr-panel">
          <div className="hr-toolbar">
            <div>
              <h3>{teacher.name}</h3>
              <p className="hr-muted">Tick các tiết giáo viên dạy ở {classLabel(data.class.name, { lower: true })}. Ô màu xám đã có giáo viên khác hoặc trùng giờ với lớp khác.</p>
            </div>
            {teacher.subjectIds.length > 1 ? (
              <label className="hr-field">
                <span>Môn dạy ở lớp này</span>
                <select value={teacherSubject} onChange={(event) => setTeacherSubject(event.target.value)}>
                  {teacher.subjectIds.map((id) => (
                    <option key={id} value={id}>{subjectNames.get(id) || 'Môn học'}</option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="tc-chip tc-chip--teal">{subjectNames.get(teacher.subjectIds[0]) || 'Môn học'}</span>
            )}
          </div>
        </div>
      ) : null}

      <div className="tc-grid-wrap">
        <table className="tc-grid">
          <thead>
            <tr>
              <th scope="col">Tiết</th>
              {TIMETABLE_WEEKDAYS.map((weekday) => (
                <th key={weekday} scope="col">{WEEKDAY_LABELS[weekday]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CELLS.map(({ session, period }) => (
              <tr key={`${session}-${period}`} className={session === 'afternoon' && period === 1 ? 'tc-session-break' : undefined}>
                <th scope="row">
                  Tiết {period}
                  <small>{SESSION_LABELS[session]} · {lessonStartTime({ session, period })}</small>
                </th>
                {TIMETABLE_WEEKDAYS.map((weekday) => {
                  const key = cellKey({ weekday, session, period });
                  const value = valueOf(key);
                  const changed = changes.some(([changedKey]) => changedKey === key);
                  return (
                    <td key={weekday}>
                      {mode === 'class' ? (
                        <ClassCell
                          cellKeyValue={key}
                          value={value}
                          changed={changed}
                          disabled={locked || task.pending}
                          teachers={data.teachers}
                          subjects={data.subjects}
                          busyAt={busyAt}
                          label={`${WEEKDAY_LABELS[weekday]}, tiết ${period} ${SESSION_LABELS[session].toLowerCase()}`}
                          onChange={(next) => setCell(key, next)}
                        />
                      ) : (
                        <TeacherCell
                          value={value}
                          changed={changed}
                          disabled={locked || task.pending}
                          teacherId={teacherId}
                          otherClass={busyAt.get(`${teacherId}|${key}`)}
                          otherTeacherName={value && value.teacherId !== teacherId ? teacherNames.get(value.teacherId) || value.teacherName || 'Giáo viên khác' : ''}
                          subjectName={value ? subjectNames.get(value.subjectId) || '' : ''}
                          label={`${WEEKDAY_LABELS[weekday]}, tiết ${period} ${SESSION_LABELS[session].toLowerCase()}`}
                          onToggle={(checked) => setCell(key, checked ? { teacherId, subjectId: teacherSubject } : null)}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tc-savebar">
        <label className="hr-field">
          <span>Áp dụng từ ngày</span>
          <input
            type="date"
            value={effectiveFrom}
            min={year.startDate}
            max={year.endDate}
            disabled={locked || task.pending}
            onChange={(event) => {
              if (!event.target.value) return;
              setEffectiveFrom(clamp(event.target.value, year));
              setDraft(new Map());
            }}
          />
        </label>
        <div className="hr-row hr-row--wrap">
          <span className="hr-muted">{changes.length ? `${changes.length} tiết thay đổi` : 'Chưa có thay đổi'}</span>
          {changes.length ? (
            <button type="button" className="hr-button hr-button--ghost" disabled={task.pending} onClick={() => setDraft(new Map())}>
              Hoàn tác
            </button>
          ) : null}
          <button type="button" className="primary-button" disabled={locked || task.pending || !changes.length} onClick={() => void save()}>
            <Icon name="check" size={15} /> {task.pending ? 'Đang lưu…' : 'Lưu lịch dạy'}
          </button>
        </div>
      </div>
      <Feedback error={task.error} success={task.success} />
    </div>
  );
}

function ClassCell({ cellKeyValue, value, changed, disabled, teachers, subjects, busyAt, label, onChange }) {
  const current = value ? `${value.teacherId}|${value.subjectId}` : '';
  const bySubject = subjects
    .filter((subject) => subject.active)
    .map((subject) => ({ subject, teachers: teachers.filter((row) => row.subjectIds.includes(subject._id)) }))
    .filter((group) => group.teachers.length);
  const known = !value || teachers.some((row) => row._id === value.teacherId && row.subjectIds.includes(value.subjectId));
  return (
    <div className={`tc-cell${value ? ' is-filled' : ''}${changed ? ' is-changed' : ''}`}>
      <select
        aria-label={label}
        value={current}
        disabled={disabled}
        onChange={(event) => {
          const [teacherId, subjectId] = event.target.value.split('|');
          onChange(teacherId ? { teacherId, subjectId } : null);
        }}
      >
        <option value="">— Trống —</option>
        {!known ? <option value={current}>{value.teacherName || 'Giáo viên'} (hiện tại)</option> : null}
        {bySubject.map(({ subject, teachers: rows }) => (
          <optgroup key={subject._id} label={subject.name}>
            {rows.map((row) => {
              const busy = busyAt.get(`${row._id}|${cellKeyValue}`);
              return (
                <option key={row._id} value={`${row._id}|${subject._id}`} disabled={Boolean(busy)}>
                  {row.name} · {subject.name}{busy ? ` (đang dạy ${busy})` : ''}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function TeacherCell({ value, changed, disabled, teacherId, otherClass, otherTeacherName, subjectName, label, onToggle }) {
  if (otherTeacherName) {
    return (
      <div className="tc-cell is-blocked">
        <strong>{otherTeacherName}</strong>
        <span>{subjectName}</span>
      </div>
    );
  }
  if (otherClass) {
    return (
      <div className="tc-cell is-blocked">
        <span className="tc-conflict">Đang dạy {otherClass}</span>
      </div>
    );
  }
  const checked = Boolean(value && value.teacherId === teacherId);
  return (
    <div className={`tc-cell${checked ? ' is-mine' : ''}${changed ? ' is-changed' : ''}`}>
      <label>
        <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} onChange={(event) => onToggle(event.target.checked)} />
        <span>{checked ? subjectName || 'Dạy' : 'Không dạy'}</span>
      </label>
    </div>
  );
}
