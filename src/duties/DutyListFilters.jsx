import { useState } from 'react';
import {
  countDutyAdvancedFilters,
  DUTY_LIST_TAB_PAST,
  DUTY_LIST_TAB_UPCOMING,
  emptyDutySearch,
} from './dutyDisplay';

export function DutyListHeading({ children }) {
  return <h3 className="duty-list-heading">{children}</h3>;
}

export function DutyListTabs({
  tab,
  onChange,
  upcomingLabel = 'Công tác chưa diễn ra',
  pastLabel = 'Công tác đã diễn ra',
}) {
  return (
    <div className="duty-list-tabs" role="tablist" aria-label="Lọc danh sách công tác">
      <button
        type="button"
        role="tab"
        aria-selected={tab === DUTY_LIST_TAB_UPCOMING}
        className={tab === DUTY_LIST_TAB_UPCOMING ? 'is-active' : undefined}
        onClick={() => onChange(DUTY_LIST_TAB_UPCOMING)}
      >
        {upcomingLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === DUTY_LIST_TAB_PAST}
        className={tab === DUTY_LIST_TAB_PAST ? 'is-active' : undefined}
        onClick={() => onChange(DUTY_LIST_TAB_PAST)}
      >
        {pastLabel}
      </button>
    </div>
  );
}

export function DutyListSearch({
  value,
  onChange,
  queryPlaceholder = 'Tìm theo tên hoặc nội dung công tác',
  personPlaceholder = 'Tên người tham gia',
  showLocation = true,
}) {
  const search = value || emptyDutySearch();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedCount = countDutyAdvancedFilters(search, { includeLocation: showLocation });
  const setField = (field, nextValue) => onChange({ ...search, [field]: nextValue });
  const clearAdvanced = () => onChange({
    ...search,
    department: '',
    person: '',
    location: showLocation ? '' : search.location,
    dateFrom: '',
    dateTo: '',
  });

  return (
    <div className="duty-list-search">
      <div className="duty-list-search-row">
        <label className="duty-list-search-field">
          <span className="sr-only">{queryPlaceholder}</span>
          <input
            type="search"
            value={search.query}
            onChange={(event) => setField('query', event.target.value)}
            placeholder={queryPlaceholder}
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
            Tổ / Phòng ban
            <input
              type="search"
              value={search.department}
              onChange={(event) => setField('department', event.target.value)}
              placeholder="Tên tổ hoặc phòng ban"
              autoComplete="off"
            />
          </label>
          <label>
            Cá nhân
            <input
              type="search"
              value={search.person}
              onChange={(event) => setField('person', event.target.value)}
              placeholder={personPlaceholder}
              autoComplete="off"
            />
          </label>
          <label>
            Thời gian từ
            <input
              type="date"
              value={search.dateFrom}
              onChange={(event) => setField('dateFrom', event.target.value)}
            />
          </label>
          <label>
            Thời gian đến
            <input
              type="date"
              value={search.dateTo}
              onChange={(event) => setField('dateTo', event.target.value)}
            />
          </label>
          {showLocation ? (
            <label className="duty-list-search-location">
              Địa điểm
              <input
                type="search"
                value={search.location || ''}
                onChange={(event) => setField('location', event.target.value)}
                placeholder="Địa điểm công tác"
                autoComplete="off"
              />
            </label>
          ) : null}
          {advancedCount ? (
            <button type="button" className="duty-list-search-clear" onClick={clearAdvanced}>
              Xóa bộ lọc
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DutyListEmpty({ tab = DUTY_LIST_TAB_UPCOMING, tone = 'mine', filtered = false }) {
  if (filtered) {
    return (
      <div className="work-empty duty-list-empty">
        <span aria-hidden="true">⌕</span>
        <p>Không tìm thấy công tác phù hợp.</p>
      </div>
    );
  }
  if (tab === DUTY_LIST_TAB_PAST) {
    return (
      <div className="work-empty duty-list-empty">
        <span aria-hidden="true">✓</span>
        <p>{tone === 'created' ? 'Chưa có công tác bạn tạo đã diễn ra.' : 'Chưa có sự kiện đã diễn ra.'}</p>
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
      <p>{tone === 'created' ? 'Bạn chưa tạo công tác nào' : 'Bạn chưa có sự kiện nào cần tham gia'}</p>
    </div>
  );
}
