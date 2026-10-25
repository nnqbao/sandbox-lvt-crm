import { useEffect, useRef, useState } from 'react';
import { emptyWorkAssignment } from './workDisplay';
import { filterByPickerSearch, personPickerHaystack } from '../lib/pickerSearch';

function SearchablePersonSelect({
  options,
  value,
  onChange,
  getLabel,
  placeholder = 'Chọn người nhận',
  searchPlaceholder = 'Tìm theo tên, email…',
  required = false,
  emptyText = 'Không tìm thấy người phù hợp.',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const selected = options.find((item) => String(item._id) === String(value));
  const filtered = filterByPickerSearch(options, query, (item) => personPickerHaystack(item, getLabel(item)));

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const choose = (id) => {
    onChange(id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className={`work-person-select ${open ? 'is-open' : ''}`} ref={rootRef}>
      <input
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        value={open ? query : (selected ? getLabel(selected) : '')}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(event) => {
          setOpen(true);
          setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (filtered.length === 1) choose(filtered[0]._id);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            setQuery('');
          }
        }}
      />
      <select
        className="sr-only"
        required={required}
        tabIndex={-1}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        aria-hidden="true"
      >
        <option value="">{placeholder}</option>
        {value ? <option value={value}>{selected ? getLabel(selected) : value}</option> : null}
      </select>
      {open ? (
        <div className="work-person-select-menu" role="listbox">
          {filtered.map((person) => (
            <button
              type="button"
              role="option"
              aria-selected={String(person._id) === String(value)}
              className={String(person._id) === String(value) ? 'is-selected' : ''}
              key={person._id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(person._id)}
            >
              {getLabel(person)}
            </button>
          ))}
          {!filtered.length ? (
            <p>{options.length ? emptyText : placeholder}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function WorkAssignmentRows({
  assignments,
  onChange,
  departments = [],
  users = [],
  showDepartments = true,
}) {
  const selectedDepartmentIds = new Set(
    assignments
      .filter((row) => row.type !== 'individual' && row.departmentId)
      .map((row) => String(row.departmentId)),
  );
  const selectedUserIds = new Set(
    assignments
      .filter((row) => row.type === 'individual')
      .flatMap((row) => (row.userIds || []).map(String)),
  );

  const updateRow = (index, patch) => {
    onChange(assignments.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  return (
    <section className="work-department-assignments duty-field">
      <header>
        <div>
          <span>PHÂN CÔNG</span>
          <h4>Người nhận việc</h4>
        </div>
        <div className="work-assignment-actions">
          {showDepartments ? (
            <button type="button" className="work-outline-button" onClick={() => onChange([...assignments, emptyWorkAssignment('department')])}>
              ＋ Phòng ban
            </button>
          ) : null}
          <button type="button" className="work-outline-button" onClick={() => onChange([...assignments, emptyWorkAssignment('individual')])}>
            ＋ Cá nhân
          </button>
        </div>
      </header>
      {assignments.length ? (
        <div className="work-inline-assignments">
          {assignments.map((row, index) => {
            const isIndividual = row.type === 'individual';
            const departmentOptions = departments.filter((department) => (
              String(department._id) === String(row.departmentId)
              || !selectedDepartmentIds.has(String(department._id))
            ));
            const userOptions = users.filter((user) => (
              (row.userIds || []).some((id) => String(id) === String(user._id))
              || !selectedUserIds.has(String(user._id))
            ));
            return (
              <div className="work-inline-row" key={`${row.type}-${index}`}>
                {isIndividual ? (
                  <label>
                    Cá nhân
                    <SearchablePersonSelect
                      required
                      options={userOptions}
                      value={row.userIds?.[0] || ''}
                      onChange={(nextId) => updateRow(index, { userIds: nextId ? [nextId] : [] })}
                      getLabel={(user) => `${user.name}${user.isSelf ? ' (bạn)' : ''}${user.departmentName ? ` · ${user.departmentName}` : ''}`}
                      placeholder="Chọn người nhận"
                      searchPlaceholder="Tìm theo tên, email…"
                    />
                  </label>
                ) : (
                  <label>
                    Phòng ban
                    <select
                      required
                      value={row.departmentId || ''}
                      onChange={(event) => updateRow(index, { departmentId: event.target.value })}
                    >
                      <option value="">Chọn phòng ban</option>
                      {departmentOptions.map((department) => (
                        <option key={department._id} value={department._id}>{department.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="work-inline-content">
                  Nội dung công việc
                  <textarea
                    required
                    maxLength={2000}
                    rows={2}
                    value={row.content}
                    onChange={(event) => updateRow(index, { content: event.target.value })}
                    placeholder="Nhập yêu cầu cho người nhận này…"
                  />
                  <small>{String(row.content || '').length}/2000</small>
                </label>
                <label>
                  Hạn chót
                  <input
                    required
                    type="date"
                    value={row.deadline || ''}
                    onChange={(event) => updateRow(index, { deadline: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="work-inline-remove"
                  onClick={() => onChange(assignments.filter((_, rowIndex) => rowIndex !== index))}
                  aria-label="Xóa phân công"
                  title="Xóa phân công"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="work-assignment-empty">
          <span>⌁</span>
          <p>
            {showDepartments
              ? 'Bấm ＋ Phòng ban hoặc ＋ Cá nhân để thêm người hoặc phòng ban nhận việc.'
              : 'Bấm ＋ Cá nhân để thêm người nhận việc.'}
          </p>
        </div>
      )}
    </section>
  );
}
