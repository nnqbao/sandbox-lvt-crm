import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { vietnamTodayYmd } from './homeroomTime';
import { sortClassesNatural } from './classOrder';
import { foldSearch, formatDate } from './homeroomLabels';
import {
  ASSIGNMENT_REPLACE_WARNING,
  CURRENT_ASSIGNMENT_TITLE,
  HISTORICAL_ASSIGNMENT_TITLE,
  UPCOMING_ASSIGNMENT_TITLE,
  buildClassArchivePayload,
  buildClassAssignmentPayload,
  buildClassCreatePayload,
  buildClassUpdatePayload,
  classStatusLabel,
  filterHomeroomTeacherClassAssignments,
  groupAssignmentsByEffect,
  schoolYearWindow,
  userRoleLabel,
} from './classCatalog';
import { EmptyState, Feedback, Icon, Loading, Modal, Notice, useAsyncTask } from './homeroomUi';

function canManageCatalog(session) {
  return Boolean(session?.isOperationalManager);
}

function ClassFormFields({ value, onChange, schoolYears = undefined }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value });
  return (
    <div className="hr-form-grid">
      {schoolYears ? (
        <label className="hr-field">
          <span>Năm học</span>
          <select value={value.schoolYearId} onChange={set('schoolYearId')} required>
            {schoolYears.map((year) => (
              <option key={year._id} value={year._id}>{year.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="hr-field">
        <span>Mã lớp *</span>
        <input
          value={value.code}
          onChange={set('code')}
          required
          maxLength={20}
          pattern="[A-Za-z0-9_\-]+"
          autoComplete="off"
          spellCheck={false}
          title="Chỉ dùng chữ, số, _ hoặc -"
          placeholder="Ví dụ: 6A1"
        />
        <small>Chữ, số, _ hoặc -. File Excel điểm danh nhận tên lớp hoặc mã lớp.</small>
      </label>
      <label className="hr-field">
        <span>Tên lớp *</span>
        <input value={value.name} onChange={set('name')} required maxLength={120} autoComplete="off" placeholder="Ví dụ: Lớp 6A1" />
      </label>
      <label className="hr-field">
        <span>Khối *</span>
        <select value={value.gradeLevel} onChange={set('gradeLevel')} required>
          <option value="6">Khối 6</option>
          <option value="7">Khối 7</option>
          <option value="8">Khối 8</option>
          <option value="9">Khối 9</option>
        </select>
      </label>
      <label className="hr-field hr-form-span">
        <span>Ghi chú</span>
        <textarea value={value.notes} onChange={set('notes')} rows={2} maxLength={500} />
      </label>
    </div>
  );
}

function ClassFormModal({ title, submitLabel, initial, schoolYears = undefined, onSubmit, onClose }) {
  const [value, setValue] = useState(initial);
  const task = useAsyncTask();
  return (
    <Modal
      title={title}
      onClose={onClose}
      busy={task.pending}
      footer={
        <>
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Hủy</button>
          <button type="submit" form="hr-class-form" className="primary-button" disabled={task.pending}>
            {task.pending ? 'Đang lưu…' : submitLabel}
          </button>
        </>
      }
    >
      <form
        id="hr-class-form"
        className="hr-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const outcome = await task.run(() => onSubmit(value));
          if (outcome.ok) onClose();
        }}
      >
        <ClassFormFields value={value} onChange={setValue} schoolYears={schoolYears} />
        <Feedback error={task.error} />
      </form>
    </Modal>
  );
}

function AssignTeacherModal({ klass, currentTeacherName = '', onClose }) {
  const candidates = useQuery(anyApi.homeroomClasses.listAssignmentCandidates, {});
  const assignUser = useMutation(anyApi.homeroomClasses.assignUser);
  const [userId, setUserId] = useState('');
  const [query, setQuery] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(() => vietnamTodayYmd());
  const task = useAsyncTask();
  const filtered = (candidates || []).filter((user) => !query || foldSearch(user.name).includes(foldSearch(query)));

  return (
    <Modal
      title={currentTeacherName ? 'Thay giáo viên chủ nhiệm' : 'Phân công giáo viên chủ nhiệm'}
      subtitle={`Lớp ${klass.code} — ${klass.name}${currentTeacherName ? ` · Hiện tại: ${currentTeacherName}` : ''}`}
      onClose={onClose}
      busy={task.pending}
      footer={
        <>
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Hủy</button>
          <button type="submit" form="hr-assign-form" className="primary-button" disabled={task.pending || !userId}>
            {task.pending ? 'Đang lưu…' : currentTeacherName ? 'Thay GVCN' : 'Phân công'}
          </button>
        </>
      }
    >
      <form
        id="hr-assign-form"
        className="hr-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const outcome = await task.run(() =>
            assignUser(buildClassAssignmentPayload({ classId: klass._id, userId, assignmentType: 'homeroom_teacher', effectiveFrom })),
          );
          if (outcome.ok) onClose();
        }}
      >
        <label className="hr-search hr-search--wide">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm giáo viên…" aria-label="Tìm giáo viên" />
        </label>
        <label className="hr-field">
          <span>Giáo viên *</span>
          <select value={userId} onChange={(event) => setUserId(event.target.value)} required size={Math.min(8, Math.max(3, filtered.length + 1))}>
            <option value="" disabled>{candidates === undefined ? 'Đang tải người dùng…' : `Chọn trong ${filtered.length} người dùng`}</option>
            {filtered.map((user) => (
              <option key={user._id} value={user._id}>
                {user.name}{user.role !== 'user' ? ` — ${userRoleLabel(user.role)}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="hr-field">
          <span>Hiệu lực từ *</span>
          <input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} required />
        </label>
        {currentTeacherName ? <p className="hr-hint"><Icon name="alert" size={13} /> {ASSIGNMENT_REPLACE_WARNING}</p> : null}
        <Feedback error={task.error} />
      </form>
    </Modal>
  );
}

function ArchiveModal({ klass, onClose }) {
  const archiveClass = useMutation(anyApi.homeroomClasses.archive);
  const task = useAsyncTask();
  return (
    <Modal
      title={`Lưu trữ lớp ${klass.code}?`}
      onClose={onClose}
      busy={task.pending}
      size="sm"
      footer={
        <>
          <button type="button" className="hr-button hr-button--ghost" onClick={onClose} disabled={task.pending}>Không</button>
          <button
            type="button"
            className="primary-button hr-button--danger hr-modal-focus"
            disabled={task.pending}
            onClick={async () => {
              const outcome = await task.run(() => archiveClass(buildClassArchivePayload(klass._id)));
              if (outcome.ok) onClose();
            }}
          >
            {task.pending ? 'Đang lưu trữ…' : 'Lưu trữ lớp'}
          </button>
        </>
      }
    >
      <p>Lớp sẽ ẩn khỏi tổng quan và không nhận điểm danh mới. Phân công GVCN đang hiệu lực sẽ kết thúc hôm nay. Dữ liệu cũ vẫn được giữ, có thể khôi phục lại.</p>
      <Feedback error={task.error} />
    </Modal>
  );
}

export function ClassCatalogPanel({ session, yearId, schoolYears = [], onOpenClass }) {
  const canManage = canManageCatalog(session);
  const classes = useQuery(
    anyApi.homeroomClasses.listCatalog,
    canManage && yearId ? { schoolYearId: yearId, includeArchived: true } : 'skip',
  );
  const createClass = useMutation(anyApi.homeroomClasses.create);
  const updateClass = useMutation(anyApi.homeroomClasses.update);
  const restoreClass = useMutation(anyApi.homeroomClasses.restore);
  const [grade, setGrade] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const restoreTask = useAsyncTask();

  const rows = useMemo(() => sortClassesNatural(classes), [classes]);
  const visible = useMemo(() => {
    const needle = foldSearch(search);
    return rows.filter((row) => {
      if (!showArchived && row.status === 'archived') return false;
      if (grade !== 'all' && String(row.gradeLevel) !== grade) return false;
      if (!needle) return true;
      return foldSearch(`${row.code} ${row.name} ${row.currentHomeroomTeacher?.user?.name || ''}`).includes(needle);
    });
  }, [rows, grade, showArchived, search]);

  if (!canManage) return null;

  const activeCount = rows.filter((row) => row.status === 'active').length;
  const archivedCount = rows.length - activeCount;
  const unassigned = rows.filter((row) => row.status === 'active' && !row.currentHomeroomTeacher).length;
  const createSchoolYears = schoolYearWindow(schoolYears, yearId);

  return (
    <section className="hr-panel" aria-labelledby="homeroom-catalog-title">
      <header className="hr-panel-head">
        <div>
          <h2 id="homeroom-catalog-title">Quản lý lớp</h2>
          <p className="hr-muted">
            {activeCount} lớp đang hoạt động{archivedCount ? ` · ${archivedCount} lớp đã lưu trữ` : ''}
            {unassigned ? ` · ${unassigned} lớp chưa có GVCN` : ''}
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() =>
            setModal({
              kind: 'create',
              initial: { schoolYearId: yearId, code: '', name: '', gradeLevel: '6', notes: '' },
            })
          }
        >
          <Icon name="plus" size={15} /> {rows.length ? 'Tạo lớp' : 'Tạo lớp đầu tiên'}
        </button>
      </header>

      {unassigned ? (
        <Notice tone="warn" icon="users" title={`${unassigned} lớp chưa được phân công GVCN.`}>
          Lớp chưa có GVCN thì không ai phân loại được vắng có phép / không phép cho lớp đó (trừ quản trị viên).
        </Notice>
      ) : null}

      <div className="hr-filter-bar">
        <div className="hr-segment" role="group" aria-label="Lọc theo khối">
          {['all', '6', '7', '8', '9'].map((key) => (
            <button key={key} type="button" aria-pressed={grade === key} onClick={() => setGrade(key)}>
              {key === 'all' ? 'Tất cả khối' : `Khối ${key}`}
            </button>
          ))}
        </div>
        <label className="hr-search">
          <Icon name="search" size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm lớp, GVCN…" aria-label="Tìm lớp" />
        </label>
        {archivedCount ? (
          <label className="hr-switch">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            <span>Hiện lớp đã lưu trữ</span>
          </label>
        ) : null}
      </div>
      <Feedback error={restoreTask.error} success={restoreTask.success} />

      {classes === undefined ? (
        <Loading label="Đang tải danh sách lớp…" />
      ) : !rows.length ? (
        <EmptyState icon="classes" title="Chưa có lớp trong năm học này.">
          Tạo lớp rồi phân công giáo viên chủ nhiệm. Giám thị điểm danh các lớp đang hoạt động tại menu Điểm danh.
        </EmptyState>
      ) : !visible.length ? (
        <EmptyState icon="search" title="Không có lớp phù hợp bộ lọc." />
      ) : (
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Lớp</th>
                <th className="is-num">Khối</th>
                <th className="is-num">Sĩ số</th>
                <th>Giáo viên chủ nhiệm</th>
                <th>Trạng thái</th>
                <th className="is-actions"><span className="hr-sr-only">Thao tác</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const archived = item.status === 'archived';
                const teacher = item.currentHomeroomTeacher?.user?.name;
                const upcoming = item.upcomingHomeroomTeacher;
                return (
                  <tr key={item._id} className={archived ? 'is-muted' : ''}>
                    <th scope="row">
                      <button type="button" className="hr-link" onClick={() => onOpenClass(item._id)}>{item.code}</button>
                      {item.name !== item.code ? <span className="hr-sub">{item.name}</span> : null}
                    </th>
                    <td className="is-num">{item.gradeLevel}</td>
                    <td className="is-num">{item.rosterCount ?? 0}</td>
                    <td>
                      {teacher ? <strong>{teacher}</strong> : <span className="hr-tag hr-tag--warn">Chưa phân công</span>}
                      {upcoming ? (
                        <span className="hr-sub">Từ {formatDate(upcoming.effectiveFrom)}: {upcoming.user?.name}</span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`hr-state hr-state--${archived ? 'muted' : 'ready'}`}>{classStatusLabel(item.status)}</span>
                    </td>
                    <td className="is-actions">
                      <div className="hr-row hr-row--end">
                        {archived ? (
                          <button
                            type="button"
                            className="hr-button hr-button--sm"
                            disabled={restoreTask.pending}
                            onClick={() => void restoreTask.run(() => restoreClass({ id: item._id }), `Đã khôi phục lớp ${item.code}.`)}
                          >
                            <Icon name="restore" size={14} /> Khôi phục
                          </button>
                        ) : (
                          <>
                            <button type="button" className="hr-button hr-button--sm" onClick={() => setModal({ kind: 'assign', klass: item, teacher })}>
                              <Icon name="users" size={14} /> {teacher ? 'Thay GVCN' : 'Gán GVCN'}
                            </button>
                            <button
                              type="button"
                              className="hr-icon-button"
                              aria-label={`Sửa lớp ${item.code}`}
                              title="Sửa lớp"
                              onClick={() =>
                                setModal({
                                  kind: 'edit',
                                  klass: item,
                                  initial: { code: item.code, name: item.name, gradeLevel: String(item.gradeLevel), notes: item.notes || '' },
                                })
                              }
                            >
                              <Icon name="edit" size={15} />
                            </button>
                            <button
                              type="button"
                              className="hr-icon-button hr-icon-button--danger"
                              aria-label={`Lưu trữ lớp ${item.code}`}
                              title="Lưu trữ lớp"
                              onClick={() => setModal({ kind: 'archive', klass: item })}
                            >
                              <Icon name="archive" size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal?.kind === 'create' ? (
        <ClassFormModal
          title="Tạo lớp"
          submitLabel="Tạo lớp"
          initial={modal.initial}
          schoolYears={createSchoolYears}
          onClose={() => setModal(null)}
          onSubmit={({ schoolYearId, code, name, gradeLevel, notes }) =>
            createClass(buildClassCreatePayload({ schoolYearId, code, name, gradeLevel, notes }))
          }
        />
      ) : null}
      {modal?.kind === 'edit' ? (
        <ClassFormModal
          title={`Sửa lớp ${modal.klass.code}`}
          submitLabel="Lưu thay đổi"
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSubmit={({ code, name, gradeLevel, notes }) =>
            updateClass(buildClassUpdatePayload({ id: modal.klass._id, code, name, gradeLevel, notes }))
          }
        />
      ) : null}
      {modal?.kind === 'assign' ? <AssignTeacherModal klass={modal.klass} currentTeacherName={modal.teacher} onClose={() => setModal(null)} /> : null}
      {modal?.kind === 'archive' ? <ArchiveModal klass={modal.klass} onClose={() => setModal(null)} /> : null}
    </section>
  );
}

function AssignmentGroup({ title, empty, rows }) {
  return (
    <div className="hr-assignment-group">
      <h4>{title}</h4>
      {!rows.length ? (
        <p className="hr-muted">{empty}</p>
      ) : (
        <ul className="hr-assignment-list">
          {rows.map((row) => (
            <li key={row._id}>
              <strong>{row.user?.name || 'Người dùng không còn hoạt động'}</strong>
              <span className="hr-sub">
                {formatDate(row.effectiveFrom)} – {row.effectiveTo ? formatDate(row.effectiveTo) : 'nay'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Tab "Quản lý lớp" trong chi tiết lớp (chỉ Admin/Mod). */
export function ClassManagePanel({ classId, detail, session, canManage }) {
  const allowed = canManage || canManageCatalog(session);
  const updateClass = useMutation(anyApi.homeroomClasses.update);
  const restoreClass = useMutation(anyApi.homeroomClasses.restore);
  const [modal, setModal] = useState(null);
  const restoreTask = useAsyncTask();
  const today = vietnamTodayYmd();

  const classAssignments = useMemo(
    () =>
      filterHomeroomTeacherClassAssignments(detail?.assignments)
        .filter((row) => row.classId === classId)
        .slice()
        .sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom))),
    [classId, detail?.assignments],
  );

  if (!allowed || !detail?.class) return null;
  const klass = detail.class;
  const archived = klass.status === 'archived';
  const { current, upcoming, historical } = groupAssignmentsByEffect(classAssignments, today);

  return (
    <div className="hr-two-col">
      <section className="hr-panel">
        <header className="hr-panel-head">
          <h3>Thông tin lớp</h3>
          {!archived ? (
            <button
              type="button"
              className="hr-button hr-button--sm"
              onClick={() =>
                setModal({ kind: 'edit', initial: { code: klass.code, name: klass.name, gradeLevel: String(klass.gradeLevel), notes: klass.notes || '' } })
              }
            >
              <Icon name="edit" size={14} /> Sửa
            </button>
          ) : null}
        </header>
        <dl className="hr-dl">
          <div><dt>Mã lớp</dt><dd>{klass.code}</dd></div>
          <div><dt>Tên lớp</dt><dd>{klass.name}</dd></div>
          <div><dt>Khối</dt><dd>{klass.gradeLevel}</dd></div>
          <div><dt>Trạng thái</dt><dd>{classStatusLabel(klass.status)}</dd></div>
          {klass.notes ? <div><dt>Ghi chú</dt><dd>{klass.notes}</dd></div> : null}
        </dl>
        <Feedback error={restoreTask.error} success={restoreTask.success} />
        <div className="hr-row">
          {archived ? (
            <button
              type="button"
              className="primary-button"
              disabled={restoreTask.pending}
              onClick={() => void restoreTask.run(() => restoreClass({ id: classId }), 'Đã khôi phục lớp.')}
            >
              <Icon name="restore" size={15} /> Khôi phục lớp
            </button>
          ) : (
            <button type="button" className="hr-button hr-button--danger-ghost" onClick={() => setModal({ kind: 'archive' })}>
              <Icon name="archive" size={15} /> Lưu trữ lớp
            </button>
          )}
        </div>
      </section>

      <section className="hr-panel">
        <header className="hr-panel-head">
          <h3>Phân công giáo viên chủ nhiệm</h3>
          {!archived ? (
            <button type="button" className="primary-button hr-button--sm" onClick={() => setModal({ kind: 'assign' })}>
              <Icon name="users" size={14} /> {detail.currentTeacherName ? 'Thay GVCN' : 'Phân công GVCN'}
            </button>
          ) : null}
        </header>
        {archived ? <p className="hr-muted">Lớp đã lưu trữ — không thể thêm phân công.</p> : null}
        <AssignmentGroup title={CURRENT_ASSIGNMENT_TITLE} empty="Chưa có GVCN đang hiệu lực." rows={current} />
        {upcoming.length ? <AssignmentGroup title={UPCOMING_ASSIGNMENT_TITLE} empty="" rows={upcoming} /> : null}
        {historical.length ? <AssignmentGroup title={HISTORICAL_ASSIGNMENT_TITLE} empty="" rows={historical} /> : null}
      </section>

      {modal?.kind === 'edit' ? (
        <ClassFormModal
          title={`Sửa lớp ${klass.code}`}
          submitLabel="Lưu thay đổi"
          initial={modal.initial}
          onClose={() => setModal(null)}
          onSubmit={({ code, name, gradeLevel, notes }) => updateClass(buildClassUpdatePayload({ id: classId, code, name, gradeLevel, notes }))}
        />
      ) : null}
      {modal?.kind === 'assign' ? (
        <AssignTeacherModal klass={klass} currentTeacherName={detail.currentTeacherName} onClose={() => setModal(null)} />
      ) : null}
      {modal?.kind === 'archive' ? <ArchiveModal klass={klass} onClose={() => setModal(null)} /> : null}
    </div>
  );
}
