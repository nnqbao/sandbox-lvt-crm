import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { sortClassesNatural } from '../homeroom/classOrder';
import { Icon } from '../homeroom/homeroomUi';

/** Current pathname, kept in sync with back/forward and in-app navigation. */
export function usePathname() {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener('lvt:locationchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('lvt:locationchange', sync);
    };
  }, []);
  return path;
}

export function navigateTo(path, { replace = false } = {}) {
  if (window.location.pathname !== path) {
    window.history[replace ? 'replaceState' : 'pushState']({ tc: true }, '', path);
    window.dispatchEvent(new Event('lvt:locationchange'));
  }
  window.scrollTo({ top: 0 });
}

export function goBack(fallback) {
  if (window.history.state?.tc) window.history.back();
  else navigateTo(fallback, { replace: true });
}

/**
 * School-year selection shared by a page and its sub-pages: defaults to Thiết lập năm học's
 * default year, the arrows walk the years in date order.
 */
export function useSchoolYears(initialId = '') {
  const years = useQuery(anyApi.schoolYears.list, {});
  const [yearId, setYearId] = useState(initialId);
  const ordered = useMemo(() => (years ? [...years].sort((a, b) => a.startDate.localeCompare(b.startDate)) : []), [years]);
  const selected =
    ordered.find((row) => row._id === yearId)
    || ordered.find((row) => row.active)
    || ordered[ordered.length - 1]
    || null;
  const index = selected ? ordered.indexOf(selected) : -1;
  const step = useCallback(
    (delta) => {
      const next = ordered[index + delta];
      if (next) setYearId(next._id);
    },
    [ordered, index],
  );
  return {
    loading: years === undefined,
    years: ordered,
    year: selected,
    setYearId,
    previous: index > 0 ? () => step(-1) : null,
    next: index >= 0 && index < ordered.length - 1 ? () => step(1) : null,
  };
}

export function YearStepper({ state, label = 'Năm học' }) {
  if (!state.year) return null;
  return (
    <div className="tc-year-stepper" role="group" aria-label={label}>
      <button type="button" className="hr-icon-button" onClick={state.previous || undefined} disabled={!state.previous} aria-label="Năm học trước">
        <Icon name="chevronLeft" size={18} />
      </button>
      <strong>
        {state.year.name}
        <small>{state.year.active ? 'Năm học mặc định' : label}</small>
      </strong>
      <button type="button" className="hr-icon-button" onClick={state.next || undefined} disabled={!state.next} aria-label="Năm học sau">
        <Icon name="chevronRight" size={18} />
      </button>
    </div>
  );
}

export const GRADE_LEVELS = [6, 7, 8, 9];

/** Khối 6–9 accordion; a click on a class calls onOpen(class). */
export function GradeClassPicker({ classes, onOpen, renderMeta = undefined, defaultOpen = [] }) {
  const [open, setOpen] = useState(() => new Set(defaultOpen));
  const byGrade = useMemo(() => {
    const groups = new Map(GRADE_LEVELS.map((grade) => [grade, []]));
    for (const row of sortClassesNatural(classes || [])) {
      if (!groups.has(row.gradeLevel)) groups.set(row.gradeLevel, []);
      groups.get(row.gradeLevel).push(row);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [classes]);
  return (
    <div>
      {byGrade.map(([grade, rows]) => {
        const expanded = open.has(grade);
        return (
          <section key={grade} className="tc-group">
            <button
              type="button"
              className="tc-group-head"
              aria-expanded={expanded}
              onClick={() =>
                setOpen((current) => {
                  const next = new Set(current);
                  if (next.has(grade)) next.delete(grade);
                  else next.add(grade);
                  return next;
                })
              }
            >
              <span>Khối {grade}</span>
              <span className="hr-row">
                <small>{rows.length} lớp</small>
                <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={16} />
              </span>
            </button>
            {expanded ? (
              rows.length ? (
                <div className="tc-class-list">
                  {rows.map((row) => (
                    <button key={row._id} type="button" className="tc-class-link" onClick={() => onOpen(row)}>
                      <span>{row.name}</span>
                      {renderMeta ? <small>{renderMeta(row)}</small> : <Icon name="chevronRight" size={16} />}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="hr-muted" style={{ padding: '12px 16px' }}>Khối này chưa có lớp trong năm học.</p>
              )
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function Stars({ value, max = 5 }) {
  const n = Math.max(0, Math.min(max, Number(value) || 0));
  return (
    <span className="tc-stars-static" role="img" aria-label={`${n} trên ${max} sao`}>
      {'★'.repeat(n)}
      <span aria-hidden="true">{'★'.repeat(max - n)}</span>
    </span>
  );
}

export function subjectNameMap(catalog) {
  return new Map((catalog?.subjects || []).map((row) => [row._id, row.name]));
}
