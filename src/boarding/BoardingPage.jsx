import React, { useRef, useState } from 'react';
import BoardingManagement from './BoardingManagement';
import BoardingReportsView from './BoardingReportsView';
import './boarding.css';

const TABS = [
  ['periods', 'Kỳ bán trú'],
  ['participants', 'Danh sách tham gia'],
];

/**
 * Menu Bán trú. Operational managers (admin/mod) set up periods and see the
 * participant list; everyone else only sees the list. convex/boarding.ts
 * enforces both (`boarding:write` for periods, Báo cáo access for the list).
 */
export default function BoardingPage({ canManage = false }) {
  const [tab, setTab] = useState('periods');
  const tabRefs = useRef({});

  if (!canManage) {
    return (
      <div className="boarding-page">
        <BoardingReportsView />
      </div>
    );
  }

  const onKeyDown = (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.findIndex(([id]) => id === tab);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="boarding-page">
      <div className="boarding-page-tabs" role="tablist" aria-label="Bán trú" onKeyDown={onKeyDown}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            ref={(node) => { tabRefs.current[id] = node; }}
            type="button"
            role="tab"
            id={`boarding-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`boarding-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`boarding-panel-${tab}`} aria-labelledby={`boarding-tab-${tab}`}>
        {tab === 'periods' ? <BoardingManagement /> : <BoardingReportsView />}
      </div>
    </div>
  );
}
