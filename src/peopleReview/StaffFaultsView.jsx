import React, { useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { DutyListHeading } from '../duties/DutyListFilters';
import { messageFor } from '../lib/appErrorMessage';
import { useNotificationFocus } from '../notifications/useNotificationFocus';
import '../duties/duties.css';
import '../work/work.css';
import './peopleReview.css';
import {
  FaultModal,
  PrivateFileButton,
  formatDate,
} from './PeopleReviewView';

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function FaultPersonPicker({ people, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const needle = normalizeSearch(query);
    const filtered = needle
      ? people.filter((person) => {
          const haystack = normalizeSearch(`${person.name} ${person.email} ${person.departmentName} ${person.positionName}`);
          return haystack.includes(needle);
        })
      : people;
    const map = new Map();
    for (const person of filtered) {
      const key = person.departmentName || 'Chưa xác định phòng ban';
      const list = map.get(key) || [];
      list.push(person);
      map.set(key, list);
    }
    return [...map.entries()].map(([departmentName, rows]) => ({ departmentName, people: rows }));
  }, [people, query]);

  return (
    <div className="pr-modal-backdrop" role="presentation">
      <div className="pr-modal pr-modal-wide">
        <button type="button" className="pr-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        <span className="pr-kicker">Ghi nhận lỗi</span>
        <h3>Chọn nhân sự</h3>
        <p className="pr-modal-context">Chỉ hiện người bạn được phép ghi nhận lỗi.</p>
        <label className="pr-field-label" htmlFor="staff-fault-person-search">Tìm người</label>
        <input
          id="staff-fault-person-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tên, email, phòng ban…"
        />
        {groups.length ? (
          <div className="pr-picker-list">
            {groups.map((group) => (
              <div className="pr-dept-group" key={group.departmentName}>
                <h4>{group.departmentName}</h4>
                {group.people.map((person) => (
                  <button
                    type="button"
                    className="pr-picker-person"
                    key={person._id}
                    onClick={() => onSelect(person)}
                  >
                    <strong>{person.name}</strong>
                    <small>
                      {person.isOps
                        ? person.positionName
                        : `${person.positionLevel || '—'}★ · ${person.positionName}`}
                    </small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="pr-empty">{people.length ? 'Không tìm thấy nhân sự phù hợp.' : 'Không có nhân sự nào bạn được ghi nhận lỗi.'}</div>
        )}
        <div className="pr-modal-actions">
          <button type="button" className="pr-ghost-button" onClick={onClose}>Hủy</button>
        </div>
      </div>
    </div>
  );
}

function emptyFaultSearch() {
  return { query: '', dateFrom: '', dateTo: '' };
}

function countFaultAdvanced(search) {
  return [search?.dateFrom, search?.dateTo].filter(Boolean).length;
}

function faultMatchesSearch(fault, search) {
  const needle = normalizeSearch(search?.query);
  if (needle) {
    const haystack = normalizeSearch(`${fault.targetName} ${fault.recordedByName} ${fault.departmentName}`);
    if (!haystack.includes(needle)) return false;
  }
  if (search?.dateFrom && fault.violationDate < search.dateFrom) return false;
  if (search?.dateTo && fault.violationDate > search.dateTo) return false;
  return true;
}

function FaultListSearch({ value, onChange }) {
  const search = value || emptyFaultSearch();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedCount = countFaultAdvanced(search);
  const setField = (field, nextValue) => onChange({ ...search, [field]: nextValue });
  return (
    <div className="duty-list-search">
      <div className="duty-list-search-row">
        <label className="duty-list-search-field">
          <span className="sr-only">Tìm người</span>
          <input
            type="search"
            value={search.query}
            onChange={(event) => setField('query', event.target.value)}
            placeholder="Tên nhân sự hoặc người ghi nhận…"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className={`duty-list-search-advanced-toggle${advancedOpen || advancedCount ? ' is-active' : ''}`}
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          Tìm kiếm nâng cao
          {advancedCount ? <span className="duty-list-search-badge">{advancedCount}</span> : null}
        </button>
      </div>
      {advancedOpen ? (
        <div className="duty-list-search-advanced">
          <label>
            Ngày vi phạm từ
            <input
              type="date"
              value={search.dateFrom}
              onChange={(event) => setField('dateFrom', event.target.value)}
            />
          </label>
          <label>
            Ngày vi phạm đến
            <input
              type="date"
              value={search.dateTo}
              onChange={(event) => setField('dateTo', event.target.value)}
            />
          </label>
          {advancedCount ? (
            <button
              type="button"
              className="duty-list-search-clear"
              onClick={() => onChange({ ...search, dateFrom: '', dateTo: '' })}
            >
              Xóa bộ lọc
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FaultEmpty({ filtered = false }) {
  if (filtered) {
    return (
      <div className="work-empty duty-list-empty">
        <span aria-hidden="true">⌕</span>
        <p>Không tìm thấy ghi nhận lỗi phù hợp.</p>
      </div>
    );
  }
  return (
    <div className="work-empty duty-list-empty duty-empty-upcoming">
      <span className="duty-empty-smile" aria-hidden="true">
        <svg viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="30" />
          <circle className="duty-empty-blush" cx="20.5" cy="40" r="5" />
          <circle className="duty-empty-blush" cx="51.5" cy="40" r="5" />
          <circle className="duty-empty-eye" cx="26" cy="31" r="3.2" />
          <circle className="duty-empty-eye" cx="46" cy="31" r="3.2" />
          <path d="M25 44c3.4 6 18.6 6 22 0" />
        </svg>
      </span>
      <p>Không có lỗi nào được ghi nhận</p>
    </div>
  );
}

function FaultCard({ fault, showTarget = false }) {
  return (
    <article className="pr-fault-card" data-focus-id={showTarget ? undefined : String(fault._id)}>
      <header>
        <strong>{formatDate(fault.violationDate)}</strong>
        {showTarget ? null : <span>Ghi bởi {fault.recordedByName}</span>}
      </header>
      {showTarget ? (
        <div className="pr-fault-person">
          <strong>{fault.targetName}</strong>
          <small>{fault.departmentName}</small>
        </div>
      ) : null}
      <p>{fault.reason}</p>
      <PrivateFileButton kind="fault" fileId={fault._id} fileName={fault.fileName} />
    </article>
  );
}

class StaffFaultsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="pr-loading" role="alert">
          <strong>Không thể tải ghi nhận lỗi.</strong>
          <p>{messageFor(this.state.error)}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function StaffFaultsPage({ focusTarget }) {
  // Bell "Ghi nhận lỗi mới" → highlight the card in "Lỗi của tôi".
  useNotificationFocus(focusTarget, { acceptSourceTypes: ['staff_fault'] });
  const [mineSearch, setMineSearch] = useState(emptyFaultSearch);
  const [recordedSearch, setRecordedSearch] = useState(emptyFaultSearch);
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState(null);
  const log = useQuery(anyApi.peopleReview.staffFaultLog, {});
  const targets = useQuery(anyApi.peopleReview.staffFaultTargets, picking || target ? {} : 'skip');

  const mineAll = useMemo(
    () => (log?.faults || []).filter((fault) => fault.isSelfTarget),
    [log],
  );
  const recordedAll = useMemo(
    () => (log?.faults || []).filter((fault) => fault.isRecordedByMe),
    [log],
  );
  const mine = useMemo(() => mineAll.filter((fault) => faultMatchesSearch(fault, mineSearch)), [mineAll, mineSearch]);
  const recorded = useMemo(
    () => recordedAll.filter((fault) => faultMatchesSearch(fault, recordedSearch)),
    [recordedAll, recordedSearch],
  );
  const showRecordedSection = Boolean(log?.canAdd || recordedAll.length);

  if (log === undefined) return <div className="pr-loading">Đang tải ghi nhận lỗi…</div>;

  return (
    <section className="pr-view duty-workspace">
      <div className="duty-list-section">
        <DutyListHeading>Lỗi của tôi</DutyListHeading>
        <FaultListSearch value={mineSearch} onChange={setMineSearch} />
        {mine.length ? (
          <div className="pr-fault-list">
            {mine.map((fault) => <FaultCard key={fault._id} fault={fault} />)}
          </div>
        ) : (
          <FaultEmpty filtered={mineAll.length > 0} />
        )}
      </div>

      {showRecordedSection ? (
      <div className="duty-list-section">
        <DutyListHeading>Lỗi do tôi ghi nhận</DutyListHeading>
        {log.canAdd ? (
          <div className="duty-list-toolbar">
            <button type="button" className="work-primary-button" onClick={() => setPicking(true)}>
              <span>+</span> Thêm ghi nhận lỗi
            </button>
          </div>
        ) : null}
        <FaultListSearch value={recordedSearch} onChange={setRecordedSearch} />
        {recorded.length ? (
          <div className="pr-fault-list">
            {recorded.map((fault) => <FaultCard key={fault._id} fault={fault} showTarget />)}
          </div>
        ) : (
          <FaultEmpty filtered={recordedAll.length > 0} />
        )}
      </div>
      ) : null}

      {picking ? (
        targets === undefined ? (
          <div className="pr-modal-backdrop">
            <div className="pr-modal"><div className="pr-loading">Đang tải danh sách nhân sự…</div></div>
          </div>
        ) : (
          <FaultPersonPicker
            people={targets.people}
            onSelect={(person) => {
              setPicking(false);
              setTarget(person);
            }}
            onClose={() => setPicking(false)}
          />
        )
      ) : null}
      {target ? (
        <FaultModal
          person={target}
          onClose={() => setTarget(null)}
          onSaved={() => setTarget(null)}
        />
      ) : null}
    </section>
  );
}

export default function StaffFaultsView({ focusTarget = null }) {
  return (
    <StaffFaultsErrorBoundary>
      <StaffFaultsPage focusTarget={focusTarget} />
    </StaffFaultsErrorBoundary>
  );
}
