import {
  LCT_ISSUING_AUTHORITY,
  LCT_NATIONAL_MOTTO_SUB,
  LCT_NATIONAL_MOTTO_TITLE,
  LCT_SCHOOL_LINES,
} from './sharedDutySchedule.js';
import './sharedDutySchedule.css';

/**
 * Page head for both Lịch công tác tabs: tabs on the left, page-level actions
 * (Import Excel, + Tạo công tác) on the right. Actions are not part of any tab.
 * `canCreate` is a UX hint only; duties.create / dutyImport re-check on the server.
 */
export default function DutyWorkspaceTabs({ view, onChoose, canCreate = false, onCreate = null, onImport = null }) {
  const showActions = Boolean(canCreate && (onCreate || onImport));
  return (
    <div className={`duty-workspace-head${showActions ? ' has-actions' : ''}`}>
      <DutyTabList view={view} onChoose={onChoose} />
      {showActions ? (
        <div className="duty-workspace-actions" role="group" aria-label="Thao tác lịch công tác">
          {onImport ? (
            <button type="button" className="work-ghost-button" onClick={onImport}>
              Import Excel
            </button>
          ) : null}
          {onCreate ? (
            <button type="button" className="work-primary-button" onClick={onCreate}>
              <span aria-hidden="true">+</span> Tạo công tác
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DutyTabList({ view, onChoose }) {
  return (
    <div className="duty-workspace-tabs" role="tablist" aria-label="Lịch công tác">
      <button
        type="button"
        role="tab"
        aria-selected={view === 'personal'}
        className={view === 'personal' ? 'is-active' : undefined}
        onClick={() => onChoose('personal')}
      >
        Lịch công tác cá nhân
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'shared'}
        className={view === 'shared' ? 'is-active' : undefined}
        onClick={() => onChoose('shared')}
      >
        Lịch công tác chung
      </button>
    </div>
  );
}

export function OfficialDutyHeader({ title }) {
  return (
    <header className="lct-official-header">
      <div className="lct-official-banner">
        <div className="lct-official-left">
          <p>{LCT_ISSUING_AUTHORITY}</p>
          <p>{LCT_SCHOOL_LINES[0]}</p>
          <p>{LCT_SCHOOL_LINES[1]}</p>
        </div>
        <div className="lct-official-right">
          <p>{LCT_NATIONAL_MOTTO_TITLE}</p>
          <p>{LCT_NATIONAL_MOTTO_SUB}</p>
        </div>
      </div>
      <h2>{title}</h2>
    </header>
  );
}
