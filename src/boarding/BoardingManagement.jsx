import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import './boarding.css';
import { boardingPeriodLabel } from './boardingLabels.js';

function schoolYearOptions() {
  const now = new Date();
  const baseYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 7 }, (_, index) => {
    const start = baseYear - 2 + index;
    return `${start}-${start + 1}`;
  });
}

function emptyForm() {
  const options = schoolYearOptions();
  return {
    semester: 1,
    schoolYear: options[2],
    participantUserIds: [],
  };
}

function errorMessage(error) {
  const raw = String(error?.data ?? error?.message ?? error ?? '');
  const messages = {
    INVALID_SEMESTER: 'Học kỳ chỉ được chọn 1 hoặc 2.',
    INVALID_SCHOOL_YEAR: 'Năm học không hợp lệ.',
    BOARDING_TEACHERS_REQUIRED: 'Vui lòng chọn ít nhất một giáo viên.',
    INVALID_BOARDING_TEACHER: 'Có giáo viên không hợp lệ hoặc đã ngưng hoạt động.',
    BOARDING_PERIOD_EXISTS: 'Kỳ bán trú này đã tồn tại.',
    BOARDING_PERIOD_NOT_FOUND: 'Không tìm thấy kỳ bán trú.',
  };
  const code = Object.keys(messages).find((key) => raw.includes(key));
  return code ? messages[code] : 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
}

function TeacherPicker({ users, selectedIds, onComplete, onClose }) {
  const [draftIds, setDraftIds] = useState(() => [...selectedIds]);
  const [search, setSearch] = useState('');
  const selected = new Set(draftIds);
  const filteredUsers = users.filter((user) =>
    `${user.name} ${user.email} ${user.departmentName} ${user.positionName}`
      .toLocaleLowerCase('vi')
      .includes(search.trim().toLocaleLowerCase('vi')),
  );
  const toggle = (userId) => {
    const next = new Set(selected);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setDraftIds([...next]);
  };

  return (
    <div className="boarding-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="boarding-teacher-modal" role="dialog" aria-modal="true" aria-labelledby="teacher-picker-title">
        <header>
          <div>
            <span>Danh sách nhân sự</span>
            <h3 id="teacher-picker-title">Chọn giáo viên tham gia</h3>
          </div>
          <button type="button" className="boarding-modal-close" onClick={onClose} aria-label="Đóng popup">×</button>
        </header>
        <div className="boarding-picker-tools">
          <input
            autoFocus
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo tên, email, phòng ban…"
          />
          <div>
            {/* With a search, both act on the people shown only and keep the other selections. */}
            <button type="button" onClick={() => setDraftIds([...new Set([...draftIds, ...filteredUsers.map((user) => user._id)])])}>
              {search.trim() ? `Chọn ${filteredUsers.length} người đang hiện` : 'Chọn tất cả'}
            </button>
            <button type="button" onClick={() => setDraftIds(search.trim() ? draftIds.filter((id) => !filteredUsers.some((user) => user._id === id)) : [])}>
              {search.trim() ? 'Bỏ chọn người đang hiện' : 'Bỏ chọn'}
            </button>
          </div>
        </div>
        <div className="boarding-teacher-grid">
          {filteredUsers.map((user) => (
            <label className={`boarding-teacher-option ${selected.has(user._id) ? 'selected' : ''}`} key={user._id}>
              <input type="checkbox" checked={selected.has(user._id)} onChange={() => toggle(user._id)} />
              <span className="boarding-teacher-avatar">
                {String(user.name || '?').trim().slice(0, 1).toLocaleUpperCase('vi')}
              </span>
              <span>
                <strong>{user.name}</strong>
                <small>{user.positionName || 'Chưa gán chức vụ'}{user.departmentName ? ` · ${user.departmentName}` : ''}</small>
                <em>{user.email}</em>
              </span>
            </label>
          ))}
          {!filteredUsers.length ? <p className="boarding-picker-empty">Không tìm thấy giáo viên phù hợp.</p> : null}
        </div>
        <footer>
          <span><strong>{draftIds.length}</strong> giáo viên đã chọn</span>
          <div>
            <button type="button" className="boarding-secondary-button" onClick={onClose}>Hủy</button>
            <button type="button" className="boarding-primary-button" onClick={() => onComplete(draftIds)}>Hoàn thành</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

export default function BoardingManagement() {
  const data = useQuery(anyApi.boarding.listAdmin);
  const create = useMutation(anyApi.boarding.create);
  const update = useMutation(anyApi.boarding.update);
  const remove = useMutation(anyApi.boarding.remove);
  const [form, setForm] = useState(emptyForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const years = useMemo(() => {
    const options = schoolYearOptions();
    if (form.schoolYear && !options.includes(form.schoolYear)) {
      options.push(form.schoolYear);
      options.sort();
    }
    return options;
  }, [form.schoolYear]);

  if (data === undefined) {
    return <div className="boarding-loading">Đang tải dữ liệu bán trú…</div>;
  }

  const selectedUsers = form.participantUserIds
    .map((userId) => data.users.find((user) => String(user._id) === String(userId)))
    .filter(Boolean);

  const resetEditor = () => {
    setForm(emptyForm());
    setEditingId('');
    setEditorOpen(false);
  };

  const startEdit = (period) => {
    setForm({
      semester: period.semester,
      schoolYear: period.schoolYear,
      participantUserIds: [...period.participantUserIds],
    });
    setEditingId(period._id);
    setEditorOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (event) => {
    event.preventDefault();
    setPending('save');
    setFeedback({ type: '', text: '' });
    try {
      if (editingId) await update({ id: editingId, ...form });
      else await create(form);
      setFeedback({
        type: 'success',
        text: editingId ? 'Đã cập nhật kỳ bán trú.' : 'Đã thêm kỳ bán trú.',
      });
      resetEditor();
    } catch (error) {
      setFeedback({ type: 'error', text: errorMessage(error) });
    } finally {
      setPending('');
    }
  };

  const deletePeriod = async (period) => {
    if (!window.confirm(`Xóa ${boardingPeriodLabel(period)}?`)) return;
    setPending(`delete-${period._id}`);
    setFeedback({ type: '', text: '' });
    try {
      await remove({ id: period._id });
      setFeedback({ type: 'success', text: 'Đã xóa kỳ bán trú.' });
    } catch (error) {
      setFeedback({ type: 'error', text: errorMessage(error) });
    } finally {
      setPending('');
    }
  };

  return (
    <section className="boarding-management">
      <div className="work-page-actions work-page-actions-only">
        <button
          type="button"
          className="boarding-add-button"
          onClick={() => {
            if (editorOpen && !editingId) resetEditor();
            else {
              setEditingId('');
              setForm(emptyForm());
              setEditorOpen(true);
            }
          }}
        >
          <span>＋</span> Thêm kỳ bán trú
        </button>
      </div>

      {feedback.text ? <div className={`boarding-feedback ${feedback.type}`}>{feedback.text}</div> : null}

      {editorOpen ? (
        <form className="boarding-editor" onSubmit={submit}>
          <div className="boarding-editor-heading">
            <div>
              <span>{editingId ? 'Chỉnh sửa thiết lập' : 'Thiết lập kỳ mới'}</span>
              <h3>{editingId ? 'Sửa kỳ bán trú' : 'Thêm kỳ bán trú'}</h3>
            </div>
            <button type="button" onClick={resetEditor} aria-label="Đóng biểu mẫu">×</button>
          </div>

          <fieldset className="boarding-semester-field">
            <legend>Học kỳ</legend>
            <div>
              {[1, 2].map((semester) => (
                <label className={form.semester === semester ? 'selected' : ''} key={semester}>
                  <input
                    type="radio"
                    name="semester"
                    value={semester}
                    checked={form.semester === semester}
                    onChange={() => setForm((current) => ({ ...current, semester }))}
                  />
                  <strong>Học kỳ {semester}</strong>
                  <small>{semester === 1 ? 'Nửa đầu năm học' : 'Nửa sau năm học'}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="boarding-year-field">
            <span>Năm học</span>
            <select value={form.schoolYear} onChange={(event) => setForm((current) => ({ ...current, schoolYear: event.target.value }))}>
              {years.map((year) => <option value={year} key={year}>{year}</option>)}
            </select>
          </label>

          <div className="boarding-participant-field">
            <div className="boarding-participant-heading">
              <span>Giáo viên tham gia</span>
              <button type="button" onClick={() => setPickerOpen(true)}>
                ＋ Thêm giáo viên
              </button>
            </div>
            {selectedUsers.length ? (
              <div className="boarding-selected-teachers">
                {selectedUsers.map((user) => (
                  <span key={user._id}>
                    <i>{String(user.name).slice(0, 1).toLocaleUpperCase('vi')}</i>
                    {user.name}
                    <button
                      type="button"
                      aria-label={`Bỏ chọn ${user.name}`}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          participantUserIds: current.participantUserIds.filter((id) => id !== user._id),
                        }))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="boarding-no-teachers">
                <span>◎</span>
                <p>Chưa có giáo viên tham gia.<small>Nhấn “Thêm giáo viên” để chọn từ danh sách.</small></p>
              </div>
            )}
          </div>

          <div className="boarding-editor-actions">
            <button type="button" className="boarding-secondary-button" onClick={resetEditor}>Hủy</button>
            <button type="submit" className="boarding-primary-button" disabled={Boolean(pending)}>
              {pending === 'save' ? 'Đang lưu…' : editingId ? 'Lưu thay đổi' : 'Tạo kỳ bán trú'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="boarding-period-section">
        <div className="boarding-list-heading">
          <div><span>Danh sách kỳ</span><h3>Các kỳ bán trú đã thiết lập</h3></div>
          <strong>{data.periods.length}</strong>
        </div>
        {data.periods.length ? (
          <div className="boarding-period-grid">
            {data.periods.map((period) => (
              <article className="boarding-period-card" key={period._id}>
                <div className="boarding-period-ribbon">{boardingPeriodLabel(period, { short: true })}</div>
                <span className="boarding-school-year">Năm học</span>
                <h3>{period.schoolYear}</h3>
                <div className="boarding-teacher-count">
                  <strong>{period.participants.length}</strong>
                  <span>giáo viên tham gia</span>
                </div>
                <div className="boarding-avatar-stack">
                  {period.participants.slice(0, 5).map((user) => (
                    <span title={user.name} key={user._id}>{String(user.name).slice(0, 1).toLocaleUpperCase('vi')}</span>
                  ))}
                  {period.participants.length > 5 ? <span>+{period.participants.length - 5}</span> : null}
                </div>
                <p>{period.participants.map((user) => user.name).join(', ')}</p>
                <footer>
                  <button type="button" onClick={() => startEdit(period)} disabled={Boolean(pending)}>Sửa</button>
                  <button type="button" className="danger" onClick={() => void deletePeriod(period)} disabled={Boolean(pending)}>Xóa</button>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="boarding-empty-periods">
            <span>⌁</span>
            <strong>Chưa có kỳ bán trú</strong>
            <p>Tạo kỳ đầu tiên để bắt đầu phân công giáo viên.</p>
          </div>
        )}
      </div>

      {pickerOpen ? (
        <TeacherPicker
          users={data.users}
          selectedIds={form.participantUserIds}
          onClose={() => setPickerOpen(false)}
          onComplete={(participantUserIds) => {
            setForm((current) => ({ ...current, participantUserIds }));
            setPickerOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
