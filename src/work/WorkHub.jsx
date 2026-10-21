import { useEffect, useState } from 'react';
import { WorkUserView } from './WorkViews';
import PersonalTodosView from './PersonalTodosView';
import { TODO_NOTIFICATION_SOURCE_TYPE } from './personalTodoDisplay.js';
import './personalTodos.css';

/**
 * Công việc menu. "Việc của tôi" is open to every active account; the work
 * documents tab only renders when the work menu is not hidden (the work backend
 * keeps enforcing its own access rules either way).
 */
export default function WorkHub({ focusTarget = null, workHidden = false }) {
  const [tab, setTab] = useState(() => (workHidden ? 'todos' : 'work'));
  const showTodos = workHidden || tab === 'todos';

  useEffect(() => {
    if (workHidden) setTab('todos');
  }, [workHidden]);

  useEffect(() => {
    if (focusTarget?.sourceType === TODO_NOTIFICATION_SOURCE_TYPE) setTab('todos');
    else if (focusTarget?.token && !workHidden) setTab('work');
  }, [focusTarget?.token, focusTarget?.sourceType, workHidden]);

  return (
    <div className="work-hub">
      {workHidden ? null : (
        <div className="work-hub-tabs" role="tablist" aria-label="Công việc">
          <button
            type="button"
            role="tab"
            id="work-hub-tab-work"
            aria-selected={!showTodos}
            aria-controls="work-hub-panel"
            className={!showTodos ? 'is-active' : undefined}
            onClick={() => setTab('work')}
          >
            Công việc
          </button>
          <button
            type="button"
            role="tab"
            id="work-hub-tab-todos"
            aria-selected={showTodos}
            aria-controls="work-hub-panel"
            className={showTodos ? 'is-active' : undefined}
            onClick={() => setTab('todos')}
          >
            Việc của tôi
          </button>
        </div>
      )}
      <div
        id="work-hub-panel"
        role={workHidden ? undefined : 'tabpanel'}
        aria-labelledby={workHidden ? undefined : showTodos ? 'work-hub-tab-todos' : 'work-hub-tab-work'}
      >
        {showTodos ? <PersonalTodosView focusTarget={focusTarget} /> : <WorkUserView focusTarget={focusTarget} />}
      </div>
    </div>
  );
}
