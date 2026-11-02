import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import ConfirmActionModal from '../lib/ConfirmActionModal';
import { filterByPickerSearch, personPickerHaystack } from '../lib/pickerSearch';
import { chatErrorText } from './chatErrorText';

function MemberPicker({ people, selected, onChange, disabled }) {
  const [search, setSearch] = useState('');
  const options = useMemo(
    () => filterByPickerSearch(people, search, (person) => personPickerHaystack(person)),
    [people, search],
  );
  const selectedSet = new Set(selected);
  const toggle = (userId) => {
    if (disabled) return;
    const next = new Set(selectedSet);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    onChange([...next]);
  };
  return (
    <div className="chat-member-picker">
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Tìm theo tên, email, tổ chuyên môn…"
        aria-label="Tìm nhân sự"
      />
      <div className="chat-member-options" role="group" aria-label="Danh sách nhân sự">
        {people === undefined ? (
          <p>Đang tải danh sách…</p>
        ) : options.length === 0 ? (
          <p>Không có nhân sự phù hợp.</p>
        ) : (
          options.map((person) => (
            <label key={person.userId}>
              <input
                type="checkbox"
                checked={selectedSet.has(person.userId)}
                onChange={() => toggle(person.userId)}
                disabled={disabled}
              />
              <span>
                <strong>{person.name}</strong>
                <small>{[person.departmentName, person.email].filter(Boolean).join(' · ')}</small>
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export function CreateGroupDialog({ onClose, onCreated }) {
  const directory = useQuery(anyApi.chatHub.directory, {});
  const createGroup = useMutation(anyApi.chatHub.createGroup);
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await createGroup({ name, memberIds });
      onCreated(String(result.groupId));
    } catch (err) {
      setError(chatErrorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="chat-dialog-backdrop" role="presentation" onClick={saving ? undefined : onClose}>
      <section
        className="chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h3 id="chat-create-title">Tạo nhóm</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" disabled={saving}>×</button>
        </header>
        <label className="chat-field">
          <span>Tên nhóm</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="Ví dụ: Tổ chuyên môn"
            autoFocus
          />
        </label>
        <p className="chat-field-label">Thành viên</p>
        <MemberPicker
          people={directory?.people}
          selected={memberIds}
          onChange={setMemberIds}
          disabled={saving}
        />
        {error ? <p className="chat-form-error" role="alert">{error}</p> : null}
        <footer>
          <button type="button" className="work-ghost-button" onClick={onClose} disabled={saving}>Hủy</button>
          <button
            type="button"
            className="work-primary-button"
            onClick={() => void submit()}
            disabled={saving || !name.trim() || !memberIds.length}
          >
            {saving ? 'Đang tạo…' : 'Tạo nhóm'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function ManageGroupDialog({ groupId, onClose, onLeft }) {
  const state = useQuery(anyApi.chatHub.groupState, groupId ? { groupId } : 'skip');
  const directory = useQuery(anyApi.chatHub.directory, state?.canManage ? {} : 'skip');
  const renameGroup = useMutation(anyApi.chatHub.renameGroup);
  const addMembers = useMutation(anyApi.chatHub.addMembers);
  const removeMember = useMutation(anyApi.chatHub.removeMember);
  const leaveGroup = useMutation(anyApi.chatHub.leaveGroup);
  const dissolveGroup = useMutation(anyApi.chatHub.dissolveGroup);
  const [name, setName] = useState('');
  const [namedFor, setNamedFor] = useState('');
  const [adding, setAdding] = useState([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    if (!state?.groupId || namedFor === state.groupId) return;
    setName(state.name || '');
    setNamedFor(state.groupId);
  }, [state?.groupId, state?.name, namedFor]);

  const busy = Boolean(pending);
  const memberIds = new Set((state?.members || []).map((member) => member.userId));
  const candidates = (directory?.people || []).filter((person) => !memberIds.has(person.userId));

  const run = async (key, action) => {
    setPending(key);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(chatErrorText(err));
    } finally {
      setPending('');
    }
  };

  return (
    <div className="chat-dialog-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <section
        className="chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-manage-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h3 id="chat-manage-title">Thành viên nhóm</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" disabled={busy}>×</button>
        </header>
        {state === undefined ? <p>Đang tải…</p> : null}
        {state === null ? <p>Nhóm không còn tồn tại hoặc bạn không còn trong nhóm.</p> : null}
        {state ? (
          <>
            {state.canManage ? (
              <form
                className="chat-rename-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run('rename', async () => {
                    await renameGroup({ groupId, name });
                  });
                }}
              >
                <label className="chat-field">
                  <span>Tên nhóm</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
                </label>
                <button type="submit" className="work-ghost-button" disabled={busy || name.trim() === state.name}>
                  Đổi tên
                </button>
              </form>
            ) : (
              <p className="chat-group-name">{state.name}</p>
            )}
            <ul className="chat-member-list">
              {(state.members || []).map((member) => (
                <li key={member.userId}>
                  <span>
                    <strong>{member.name}</strong>
                    <small>{member.role === 'owner' ? 'Chủ nhóm' : 'Thành viên'}{member.isSelf ? ' · Bạn' : ''}</small>
                  </span>
                  {state.canManage && member.role !== 'owner' ? (
                    <button
                      type="button"
                      onClick={() => void run(`remove-${member.userId}`, () => removeMember({ groupId, userId: member.userId }))}
                      disabled={busy}
                    >
                      Xóa
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {state.canManage ? (
              <>
                <p className="chat-field-label">Thêm thành viên</p>
                <MemberPicker
                  people={directory === undefined ? undefined : candidates}
                  selected={adding}
                  onChange={setAdding}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="work-ghost-button"
                  disabled={busy || !adding.length}
                  onClick={() => void run('add', async () => {
                    await addMembers({ groupId, memberIds: adding });
                    setAdding([]);
                  })}
                >
                  Thêm vào nhóm
                </button>
              </>
            ) : null}
          </>
        ) : null}
        {error ? <p className="chat-form-error" role="alert">{error}</p> : null}
        <footer>
          {state?.canLeave ? (
            <button type="button" className="work-ghost-button" disabled={busy} onClick={() => setConfirm('leave')}>
              Rời nhóm
            </button>
          ) : <span />}
          {state?.canDissolve ? (
            <button type="button" className="chat-danger-button" disabled={busy} onClick={() => setConfirm('dissolve')}>
              Giải tán nhóm
            </button>
          ) : null}
        </footer>
        {confirm ? (
          <ConfirmActionModal
            title={confirm === 'dissolve' ? 'Giải tán nhóm này?' : 'Rời khỏi nhóm này?'}
            confirmLabel={confirm === 'dissolve' ? 'Giải tán' : 'Rời nhóm'}
            pending={busy}
            onCancel={() => setConfirm('')}
            onConfirm={() => {
              const action = confirm;
              setConfirm('');
              void run(action, async () => {
                if (action === 'dissolve') await dissolveGroup({ groupId });
                else await leaveGroup({ groupId });
                onLeft();
              });
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
