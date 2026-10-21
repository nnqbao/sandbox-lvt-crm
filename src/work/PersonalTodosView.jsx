import { Component, useId, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import ConfirmActionModal from '../lib/ConfirmActionModal';
import { messageFor } from '../lib/appErrorMessage';
import { useNotificationFocus } from '../notifications/useNotificationFocus';
import {
  emptyTodoForm,
  formatTodoMoment,
  isTodoOverdue,
  TODO_NOTE_MAX,
  TODO_NOTIFICATION_SOURCE_TYPE,
  TODO_TITLE_MAX,
  todoFormFromItem,
  validateTodoForm,
} from './personalTodoDisplay.js';

class TodoQueryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="todo-state is-error" role="alert">
        <p>Không tải được danh sách việc. {messageFor(this.state.error)}</p>
        <button type="button" className="work-ghost-button" onClick={() => this.setState({ error: null })}>
          Thử lại
        </button>
      </div>
    );
  }
}

function TodoForm({ initial, editingId = null, previousRemindAt = null, onDone, onCancel = null }) {
  const formId = useId();
  const create = useMutation(anyApi.personalTodos.create);
  const update = useMutation(anyApi.personalTodos.update);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState(/** @type {Record<string, string | undefined>} */ ({}));
  const [serverError, setServerError] = useState('');
  const [pending, setPending] = useState(false);

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (pending) return;
    const result = validateTodoForm(form, Date.now(), previousRemindAt);
    setErrors(result.errors);
    if (!result.ok) return;
    setPending(true);
    setServerError('');
    try {
      if (editingId) await update({ id: editingId, ...result.payload });
      else await create(result.payload);
      if (!editingId) setForm(emptyTodoForm());
      onDone?.(editingId ? 'Đã lưu việc.' : 'Đã thêm việc.');
    } catch (error) {
      console.error('Personal todo save failed', error);
      setServerError(messageFor(error));
    } finally {
      setPending(false);
    }
  };

  const field = (name) => `${formId}-${name}`;
  return (
    <form className="todo-form" onSubmit={submit} noValidate aria-label={editingId ? 'Sửa việc' : 'Thêm việc mới'}>
      {serverError ? <p className="work-feedback error" role="alert">{serverError}</p> : null}
      <div className="todo-field todo-field-wide">
        <label htmlFor={field('title')}>Tên việc <span aria-hidden="true">*</span></label>
        <input
          id={field('title')}
          type="text"
          required
          maxLength={TODO_TITLE_MAX}
          value={form.title}
          onChange={(event) => setField('title', event.target.value)}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? field('title-error') : undefined}
        />
        {errors.title ? <small id={field('title-error')} className="todo-field-error">{errors.title}</small> : null}
      </div>
      <div className="todo-field todo-field-wide">
        <label htmlFor={field('note')}>Ghi chú</label>
        <textarea
          id={field('note')}
          rows={2}
          maxLength={TODO_NOTE_MAX}
          value={form.note}
          onChange={(event) => setField('note', event.target.value)}
          aria-invalid={Boolean(errors.note)}
          aria-describedby={errors.note ? field('note-error') : undefined}
        />
        {errors.note ? <small id={field('note-error')} className="todo-field-error">{errors.note}</small> : null}
      </div>
      <div className="todo-field">
        <label htmlFor={field('due')}>Hạn chót</label>
        <input
          id={field('due')}
          type="datetime-local"
          step={60}
          value={form.due}
          onChange={(event) => setField('due', event.target.value)}
          aria-invalid={Boolean(errors.due)}
          aria-describedby={errors.due ? field('due-error') : undefined}
        />
        {errors.due ? <small id={field('due-error')} className="todo-field-error">{errors.due}</small> : null}
      </div>
      <div className="todo-field">
        <label htmlFor={field('remind')}>Nhắc lúc</label>
        <input
          id={field('remind')}
          type="datetime-local"
          step={60}
          value={form.remind}
          onChange={(event) => setField('remind', event.target.value)}
          aria-invalid={Boolean(errors.remind)}
          aria-describedby={errors.remind ? field('remind-error') : field('remind-help')}
        />
        {errors.remind ? (
          <small id={field('remind-error')} className="todo-field-error">{errors.remind}</small>
        ) : (
          <small id={field('remind-help')} className="todo-field-help">Gửi thông báo tới bạn vào giờ này.</small>
        )}
      </div>
      <div className="todo-form-actions">
        {onCancel ? (
          <button type="button" className="work-ghost-button" onClick={onCancel} disabled={pending}>
            Hủy
          </button>
        ) : null}
        <button type="submit" className="work-primary-button" disabled={pending}>
          {pending ? 'Đang lưu…' : editingId ? 'Lưu' : 'Thêm việc'}
        </button>
      </div>
    </form>
  );
}

function TodoItem({ todo, editing, onEdit, onCancelEdit, onSaved, onToggle, onDelete, busy }) {
  const checkboxId = useId();
  if (editing) {
    return (
      <li className="todo-item is-editing" data-focus-id={todo._id}>
        <TodoForm
          initial={todoFormFromItem(todo)}
          editingId={todo._id}
          previousRemindAt={todo.remindAt}
          onDone={onSaved}
          onCancel={onCancelEdit}
        />
      </li>
    );
  }
  const done = Boolean(todo.completedAt);
  const overdue = isTodoOverdue(todo);
  return (
    <li className={`todo-item${done ? ' is-done' : ''}`} data-focus-id={todo._id}>
      <div className="todo-check">
        <input
          id={checkboxId}
          type="checkbox"
          checked={done}
          disabled={busy}
          onChange={(event) => onToggle(todo, event.target.checked)}
        />
        <label htmlFor={checkboxId} className="todo-check-label">
          <span className="sr-only">Hoàn thành: </span>
          <strong className="todo-title">{todo.title}</strong>
        </label>
      </div>
      {todo.note ? <p className="todo-note">{todo.note}</p> : null}
      <p className="todo-meta">
        {done ? <span className="todo-pill is-done">Hoàn thành</span> : overdue ? <span className="todo-pill is-overdue">Quá hạn</span> : null}
        {todo.dueAt ? <span>Hạn chót {formatTodoMoment(todo.dueAt)}</span> : <span>Không có hạn chót</span>}
        {todo.remindAt ? <span>Nhắc lúc {formatTodoMoment(todo.remindAt)}</span> : null}
        {done ? <span>Xong lúc {formatTodoMoment(todo.completedAt)}</span> : null}
      </p>
      <div className="todo-actions">
        {!done ? (
          <button type="button" className="work-ghost-button" onClick={() => onEdit(todo)} disabled={busy}>
            Sửa
          </button>
        ) : null}
        <button type="button" className="work-ghost-button todo-delete" onClick={() => onDelete(todo)} disabled={busy}>
          Xóa
        </button>
      </div>
    </li>
  );
}

function TodoList({ focusTarget }) {
  const data = useQuery(anyApi.personalTodos.listMine, {});
  const setCompleted = useMutation(anyApi.personalTodos.setCompleted);
  const remove = useMutation(anyApi.personalTodos.remove);
  const [editingId, setEditingId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);

  useNotificationFocus(focusTarget, { acceptSourceTypes: [TODO_NOTIFICATION_SOURCE_TYPE] });

  const run = async (id, operation, success) => {
    setBusyId(id);
    setFeedback({ type: '', text: '' });
    try {
      await operation();
      if (success) setFeedback({ type: 'success', text: success });
      return true;
    } catch (error) {
      console.error('Personal todo action failed', error);
      setFeedback({ type: 'error', text: messageFor(error) });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const itemProps = (todo) => ({
    todo,
    editing: editingId === String(todo._id),
    busy: busyId === String(todo._id),
    onEdit: (item) => setEditingId(String(item._id)),
    onCancelEdit: () => setEditingId(null),
    onSaved: (text) => {
      setEditingId(null);
      setFeedback({ type: 'success', text });
    },
    onToggle: (item, done) => void run(String(item._id), () => setCompleted({ id: item._id, done })),
    onDelete: (item) => setConfirmDelete(item),
  });

  return (
    <>
      <section className="todo-card" aria-labelledby="todo-add-heading">
        <h3 id="todo-add-heading">Thêm việc</h3>
        <TodoForm initial={emptyTodoForm()} onDone={(text) => setFeedback({ type: 'success', text })} />
      </section>

      {feedback.text ? (
        <div className={`work-feedback ${feedback.type}`} role="status" aria-live="polite">
          {feedback.text}
        </div>
      ) : null}

      {data === undefined ? (
        <p className="todo-state">Đang tải danh sách việc…</p>
      ) : (
        <>
          <section className="todo-card" aria-labelledby="todo-open-heading">
            <h3 id="todo-open-heading">
              Cần làm <span className="todo-count">{data.open.length}</span>
            </h3>
            {data.open.length ? (
              <ul className="todo-list">
                {data.open.map((todo) => <TodoItem key={todo._id} {...itemProps(todo)} />)}
              </ul>
            ) : (
              <p className="todo-state">Chưa có việc cần làm. Thêm việc ở biểu mẫu phía trên.</p>
            )}
          </section>
          {data.completed.length ? (
            <section className="todo-card" aria-labelledby="todo-done-heading">
              <h3 id="todo-done-heading">
                Đã hoàn thành gần đây <span className="todo-count">{data.completed.length}</span>
              </h3>
              <ul className="todo-list">
                {data.completed.map((todo) => <TodoItem key={todo._id} {...itemProps(todo)} />)}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {confirmDelete ? (
        <ConfirmActionModal
          title={`Xóa việc “${confirmDelete.title}”? Việc sẽ biến mất khỏi danh sách và không còn nhắc.`}
          confirmLabel="Xóa"
          pending={busyId === String(confirmDelete._id)}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const target = confirmDelete;
            const ok = await run(String(target._id), () => remove({ id: target._id }), 'Đã xóa việc.');
            if (ok) {
              setConfirmDelete(null);
              if (editingId === String(target._id)) setEditingId(null);
            }
          }}
        />
      ) : null}
    </>
  );
}

/** "Việc của tôi": private to-dos, visible only to their owner. */
export default function PersonalTodosView({ focusTarget = null }) {
  return (
    <section className="work-user-view personal-todos-view">
      <header className="todo-head">
        <h2>Việc của tôi</h2>
        <p>Danh sách việc riêng của bạn. Chỉ bạn nhìn thấy, không cần duyệt và không liên quan đến công văn.</p>
      </header>
      <TodoQueryBoundary>
        <TodoList focusTarget={focusTarget} />
      </TodoQueryBoundary>
    </section>
  );
}
