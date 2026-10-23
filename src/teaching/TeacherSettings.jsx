import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { settingsSubPath, settingsSubPathname } from '../navigationRoutes';
import { foldSearch } from '../homeroom/homeroomLabels';
import { EmptyState, Feedback, Icon, Loading, Modal, Notice, useAsyncTask } from '../homeroom/homeroomUi';
import { vietnamNowParts } from '../lib/teachingSchedule';
import ScheduleCalendar from './ScheduleCalendar';
import TimetableEditor from './TimetableEditor';
import {
  GradeClassPicker,
  goBack,
  navigateTo,
  subjectNameMap,
  usePathname,
  useSchoolYears,
  YearStepper,
} from './teachingShared';
import '../homeroom/homeroom.css';
import './teaching.css';

/**
 * Thiết lập giáo viên (Administrator): danh sách giáo viên theo phòng ban → Lịch dạy cả năm
 * → Thêm lịch dạy (chọn khối → lớp → tick tiết).
 */
export default function TeacherSettings() {
  const path = usePathname();
  const [teacherId, action, classId] = settingsSubPath('teachers', path);
  const yearState = useSchoolYears();
  const ensureDefaults = useMutation(anyApi.teachingCatalog.ensureDefaults);
  const catalog = useQuery(anyApi.teachingCatalog.catalog, {});

  useEffect(() => {
    void ensureDefaults({}).catch(() => {});
  }, [ensureDefaults]);

  if (yearState.loading || catalog === undefined) {
    return (
      <section className="homeroom-view">
        <Loading label="Đang tải Thiết lập giáo viên…" />
      </section>
    );
  }
  if (!yearState.year) {
    return (
      <section className="homeroom-view">
        <EmptyState icon="calendar" title="Chưa có năm học.">
          Tạo năm học trong Thiết lập năm học trước khi thiết lập giáo viên.
        </EmptyState>
      </section>
    );
  }
  const subjectNames = subjectNameMap(catalog);
  const listPath = settingsSubPathname('teachers');

  return (
    <section className="homeroom-view">
      {!teacherId ? (
        <TeacherList yearState={yearState} catalog={catalog} subjectNames={subjectNames} />
      ) : !action ? (
        <TeacherSchedulePage yearState={yearState} teacherId={teacherId} subjectNames={subjectNames} onBack={() => goBack(listPath)} />
      ) : action === 'them' && !classId ? (
        <AddSchedulePage yearState={yearState} teacherId={teacherId} onBack={() => goBack(settingsSubPathname('teachers', teacherId))} />
      ) : (
        <TeacherClassEditor
          teacherId={teacherId}
          classId={classId}
          onBack={() => goBack(settingsSubPathname('teachers', teacherId, 'them'))}
        />
      )}
    </section>
  );
}

function TeacherList({ yearState, catalog, subjectNames }) {
  const data = useQuery(anyApi.teachers.listForYear, { schoolYearId: yearState.year._id });
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const groups = useMemo(() => {
    if (!data) return [];
    const needle = foldSearch(search);
    const rows = data.teachers.filter((row) => !needle || foldSearch(row.name).includes(needle));
    const departments = [...data.departments, { _id: '', name: 'Chưa có phòng ban' }];
    return departments
      .map((department) => ({ department, teachers: rows.filter((row) => row.departmentId === department._id) }))
      .concat([{
        department: { _id: '__other', name: 'Phòng ban khác' },
        teachers: rows.filter((row) => row.departmentId && !data.departments.some((item) => item._id === row.departmentId)),
      }])
      .filter((group) => group.teachers.length);
  }, [data, search]);

  return (
    <div className="hr-stack">
      <header className="tc-page-head">
        <div>
          <span className="hr-eyebrow">Thiết lập tối cao</span>
          <h2>Thiết lập giáo viên</h2>
          <p className="hr-muted">
            Giáo viên theo phòng ban với Môn giảng dạy, Lớp giảng dạy, Lớp chủ nhiệm của năm học. Sang năm mới, Lớp giảng dạy và
            Lớp chủ nhiệm bắt đầu trống; Môn giảng dạy lấy lại từ năm trước và có thể chỉnh.
          </p>
        </div>
        <YearStepper state={yearState} />
      </header>

      <label className="hr-search hr-search--wide">
        <Icon name="search" size={15} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm giáo viên…" aria-label="Tìm giáo viên" />
      </label>

      {data === undefined ? (
        <Loading label="Đang tải giáo viên…" />
      ) : !groups.length ? (
        <EmptyState icon="users" title={search ? 'Không tìm thấy giáo viên phù hợp.' : 'Chưa có tài khoản đang hoạt động.'} />
      ) : (
        groups.map(({ department, teachers }) => (
          <section key={department._id} className="tc-group">
            <div className="tc-group-head">
              <span>{department.name}</span>
              <small>{teachers.length} giáo viên</small>
            </div>
            <div className="hr-table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="hr-table">
                <thead>
                  <tr>
                    <th scope="col">Tên giáo viên</th>
                    <th scope="col">Môn giảng dạy</th>
                    <th scope="col">Lớp giảng dạy</th>
                    <th scope="col">Lớp chủ nhiệm</th>
                    <th scope="col" className="is-actions">Lịch dạy</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((row) => (
                    <tr key={row._id}>
                      <th scope="row">{row.name}</th>
                      <td>
                        <div className="hr-row hr-row--wrap">
                          <ChipList items={row.subjectIds.map((id) => subjectNames.get(id) || 'Môn học')} tone="teal" empty="Chưa chọn" />
                          {row.subjectsInherited ? <span className="tc-chip tc-chip--gold">Từ năm trước</span> : null}
                          <button
                            type="button"
                            className="hr-icon-button"
                            onClick={() => setEditing(row)}
                            aria-label={`Sửa môn giảng dạy của ${row.name}`}
                            title="Sửa môn giảng dạy"
                            disabled={yearState.year.lockedAt != null}
                          >
                            <Icon name="edit" size={15} />
                          </button>
                        </div>
                      </td>
                      <td><ChipList items={row.teachingClasses.map((item) => item.name)} tone="blue" empty="—" /></td>
                      <td><ChipList items={row.homeroomClasses.map((item) => item.name)} empty="—" /></td>
                      <td className="is-actions">
                        <button type="button" className="hr-button hr-button--sm" onClick={() => navigateTo(settingsSubPathname('teachers', row._id))}>
                          <Icon name="calendar" size={14} /> Xem lịch
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      {editing ? (
        <SubjectModal
          teacher={editing}
          year={yearState.year}
          subjects={catalog.subjects.filter((row) => row.active)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function ChipList({ items, tone = '', empty }) {
  if (!items.length) return <span className="tc-empty-cell">{empty}</span>;
  return (
    <span className="tc-chip-list">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className={`tc-chip${tone ? ` tc-chip--${tone}` : ''}`}>{item}</span>
      ))}
    </span>
  );
}

function SubjectModal({ teacher, year, subjects, onClose }) {
  const save = useMutation(anyApi.teachers.setSubjects);
  const task = useAsyncTask();
  const [selected, setSelected] = useState(() => new Set(teacher.subjectIds));
  return (
    <Modal
      title={`Môn giảng dạy · ${teacher.name}`}
      subtitle={`Năm học ${year.name}`}
      onClose={onClose}
      busy={task.pending}
      footer={
        <>
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Hủy</button>
          <button
            type="button"
            className="primary-button"
            disabled={task.pending}
            onClick={async () => {
              const outcome = await task.run(() =>
                save({ schoolYearId: year._id, userId: teacher._id, subjectIds: [...selected] }),
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
        {teacher.subjectsInherited ? (
          <Notice tone="info" icon="restore" title="Đang lấy theo năm học trước.">Bấm Lưu để xác nhận cho năm {year.name}.</Notice>
        ) : null}
        <fieldset className="hr-stack hr-stack--tight" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="hr-muted">Chọn một hoặc nhiều môn</legend>
          {subjects.map((subject) => (
            <label key={subject._id} className="hr-switch">
              <input
                type="checkbox"
                checked={selected.has(subject._id)}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(subject._id);
                    else next.delete(subject._id);
                    return next;
                  })
                }
              />
              <span>{subject.name}</span>
            </label>
          ))}
        </fieldset>
        <Feedback error={task.error} />
      </div>
    </Modal>
  );
}

function BackLink({ onBack, label }) {
  return (
    <button type="button" className="hr-back" onClick={onBack}>
      <Icon name="arrowLeft" size={15} /> {label}
    </button>
  );
}

function TeacherSchedulePage({ yearState, teacherId, subjectNames, onBack }) {
  const data = useQuery(anyApi.teachers.schedule, { schoolYearId: yearState.year._id, teacherId });
  return (
    <div className="hr-stack">
      <BackLink onBack={onBack} label="Danh sách giáo viên" />
      <header className="tc-page-head">
        <div>
          <span className="hr-eyebrow">Lịch dạy</span>
          <h2>{data?.teacher.name || 'Giáo viên'}</h2>
          <p className="hr-muted">Toàn bộ lịch dạy trong năm học, theo thời khóa biểu đã xếp và lịch nghỉ của Thiết lập năm học.</p>
        </div>
        <div className="hr-row hr-row--wrap">
          <YearStepper state={yearState} />
          <button
            type="button"
            className="primary-button"
            disabled={Boolean(data?.year.locked)}
            onClick={() => navigateTo(settingsSubPathname('teachers', teacherId, 'them'))}
          >
            <Icon name="plus" size={15} /> Thêm lịch dạy
          </button>
        </div>
      </header>
      {data === undefined ? (
        <Loading label="Đang tải lịch dạy…" />
      ) : (
        <ScheduleCalendar key={data.year._id} data={data} subjectNames={subjectNames} />
      )}
    </div>
  );
}

function AddSchedulePage({ yearState, teacherId, onBack }) {
  const classes = useQuery(anyApi.homeroomClasses.listCatalog, { schoolYearId: yearState.year._id });
  const schedule = useQuery(anyApi.teachers.schedule, { schoolYearId: yearState.year._id, teacherId });
  const today = vietnamNowParts().date;
  const countByClass = useMemo(() => {
    const map = new Map();
    for (const slot of schedule?.slots || []) {
      if (slot.effectiveTo && slot.effectiveTo < today) continue;
      map.set(slot.classId, (map.get(slot.classId) || 0) + 1);
    }
    return map;
  }, [schedule, today]);
  return (
    <div className="hr-stack">
      <BackLink onBack={onBack} label="Lịch dạy" />
      <header className="tc-page-head">
        <div>
          <span className="hr-eyebrow">Thêm lịch dạy · Năm học {yearState.year.name}</span>
          <h2>{schedule?.teacher.name || 'Giáo viên'}</h2>
          <p className="hr-muted">Chọn khối rồi chọn lớp để tick các tiết giáo viên dạy.</p>
        </div>
      </header>
      {classes === undefined ? (
        <Loading label="Đang tải lớp…" />
      ) : !classes.length ? (
        <EmptyState icon="classes" title="Năm học chưa có lớp.">Tạo lớp tại Lớp học › Quản lý lớp.</EmptyState>
      ) : (
        <GradeClassPicker
          classes={classes}
          defaultOpen={[6, 7, 8, 9]}
          renderMeta={(row) => (countByClass.get(row._id) ? `${countByClass.get(row._id)} tiết/tuần` : 'Chưa xếp')}
          onOpen={(row) => navigateTo(settingsSubPathname('teachers', teacherId, 'them', row._id))}
        />
      )}
    </div>
  );
}

function TeacherClassEditor({ teacherId, classId, onBack }) {
  return (
    <div className="hr-stack">
      <BackLink onBack={onBack} label="Chọn lớp" />
      <TimetableEditor classId={classId} mode="teacher" teacherId={teacherId} />
    </div>
  );
}
