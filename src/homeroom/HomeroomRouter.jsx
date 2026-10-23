import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { homeroomPathname, pathnameForMenu } from '../navigationRoutes';
import { homeroomRoles, parseHomeroomPath } from './homeroomRoutes';
import { vietnamTodayYmd } from './homeroomTime';
import { formatDateLong, isYmd } from './homeroomLabels';
import { HomeroomStudentQueryErrorBoundary } from './studentQueryErrorBoundary';
import { HomeroomViewErrorBoundary, Icon, Loading } from './homeroomUi';
import HomeroomOverview from './HomeroomOverview';
import { MySchedule, TeachingClasses, TeachingOverview } from '../teaching/TeachingViews';
import { GradebookClass, GradebookClasses, StudentGradebook } from '../teaching/Gradebook';
import HomeroomClassDetail from './HomeroomClassDetail';
import HomeroomStudentDetail from './HomeroomStudentDetail';
import { ClassCatalogPanel } from './HomeroomClassCatalog';
import './homeroom.css';

export { parseHomeroomPath, homeroomRoles };

function readDateParam() {
  const value = new URLSearchParams(window.location.search).get('ngay');
  return isYmd(value) ? value : '';
}

export default function HomeroomRouter({ session }) {
  const [location, setLocation] = useState(() => ({ path: window.location.pathname, date: readDateParam() }));
  const route = useMemo(() => parseHomeroomPath(location.path), [location.path]);
  const years = useQuery(anyApi.schoolYears.list, {});
  const [yearId, setYearId] = useState('');
  const roles = homeroomRoles(session);
  const selectedYearId =
    (yearId && years?.some((item) => item._id === yearId) ? yearId : '') ||
    years?.find((item) => item.active)?._id ||
    years?.[0]?._id ||
    '';
  const selectedYear = years?.find((item) => item._id === selectedYearId);

  useEffect(() => {
    const sync = () => setLocation({ path: window.location.pathname, date: readDateParam() });
    window.addEventListener('popstate', sync);
    window.addEventListener('lvt:locationchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('lvt:locationchange', sync);
    };
  }, []);

  const go = useCallback((next, { date = '', replace = false } = {}) => {
    const url = date ? `${next}?ngay=${date}` : next;
    if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history[replace ? 'replaceState' : 'pushState']({ hr: true }, '', url);
    }
    setLocation({ path: next, date });
    window.scrollTo({ top: 0 });
  }, []);

  const goBack = useCallback(() => {
    if (window.history.state?.hr) window.history.back();
    else go(homeroomPathname());
  }, [go]);

  const nav = {
    overview: () => go(homeroomPathname()),
    section: (section) => go(homeroomPathname({ section })),
    gradebookClass: (id) => go(homeroomPathname({ gradebookClassId: id })),
    gradebookStudent: (id) => go(homeroomPathname({ gradebookStudentId: id })),
    manage: () => go(homeroomPathname({ manageClasses: true })),
    openClass: (id, tab = '', date = '') => go(homeroomPathname({ classId: id, tab: tab || undefined }), { date }),
    openStudent: (id) => go(homeroomPathname({ studentId: id })),
    back: goBack,
  };

  if (years === undefined) {
    return (
      <section className="homeroom-view">
        <Loading label="Đang tải Lớp học…" />
      </section>
    );
  }

  const navItems = [
    { key: 'overview', label: 'Tổng quan', icon: 'overview', show: true, onClick: nav.overview },
    { key: 'homeroom', label: 'Lớp chủ nhiệm', icon: 'users', show: true, onClick: () => nav.section('homeroom') },
    { key: 'teaching', label: 'Lớp giảng dạy', icon: 'edit', show: true, onClick: () => nav.section('teaching') },
    { key: 'schedule', label: 'Lịch dạy', icon: 'calendar', show: true, onClick: () => nav.section('schedule') },
    { key: 'gradebook', label: 'Học bạ', icon: 'file', show: true, onClick: () => nav.section('gradebook') },
    { key: 'manage', label: 'Quản lý lớp', icon: 'classes', show: roles.isManager, onClick: nav.manage },
  ].filter((item) => item.show);
  const activeKey =
    route.view === 'class' || route.view === 'student'
      ? ''
      : route.view === 'gradebookClass' || route.view === 'gradebookStudent'
        ? 'gradebook'
        : route.view;
  const resetKey = `${location.path}|${selectedYearId}`;

  return (
    <section className="homeroom-view">
      <header className="hr-shell-head">
        <div className="hr-shell-title">
          <span className="hr-eyebrow">Lớp học</span>
          <h1>{selectedYear ? `Năm học ${selectedYear.name}` : 'Chưa có năm học'}</h1>
          <p>{formatDateLong(vietnamTodayYmd())}</p>
        </div>
        <div className="hr-shell-controls">
          <label className="hr-year-select">
            <span>Năm học</span>
            <select
              value={selectedYearId}
              disabled={!years?.length}
              onChange={(event) => {
                setYearId(event.target.value);
                if (route.view === 'class' || route.view === 'student') nav.overview();
                if (route.view === 'gradebookClass' || route.view === 'gradebookStudent') nav.section('gradebook');
              }}
            >
              {!years?.length ? <option value="">Chưa có năm học</option> : null}
              {(years || []).map((year) => (
                <option key={year._id} value={year._id}>
                  {year.name}{year.active ? ' · mặc định' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedYearId ? (
          <nav className="hr-shell-nav" aria-label="Điều hướng Lớp học">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className="hr-shell-tab"
                aria-current={activeKey === item.key ? 'page' : undefined}
                onClick={item.onClick}
              >
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        ) : null}
      </header>

      {!selectedYearId ? (
        <EmptySchoolYearState isAdmin={Boolean(session?.isAdmin)} />
      ) : (
        <HomeroomViewErrorBoundary resetKey={resetKey} onBack={nav.overview}>
          {route.view === 'overview' ? (
            <TeachingOverview yearId={selectedYearId} nav={nav} />
          ) : route.view === 'homeroom' ? (
            <HomeroomOverview yearId={selectedYearId} roles={roles} nav={nav} />
          ) : route.view === 'teaching' ? (
            <TeachingClasses yearId={selectedYearId} />
          ) : route.view === 'schedule' ? (
            <MySchedule yearId={selectedYearId} />
          ) : route.view === 'gradebook' ? (
            <GradebookClasses yearId={selectedYearId} nav={nav} />
          ) : route.view === 'gradebookClass' ? (
            <GradebookClass key={route.classId} classId={route.classId} nav={nav} />
          ) : route.view === 'gradebookStudent' ? (
            <StudentGradebook key={route.studentId} studentId={route.studentId} nav={nav} />
          ) : route.view === 'manage' ? (
            roles.isManager ? (
              <ClassCatalogPanel session={session} yearId={selectedYearId} schoolYears={years} onOpenClass={(id) => nav.openClass(id)} />
            ) : (
              <Forbidden text="Chỉ quản trị viên mới được quản lý lớp." onBack={nav.overview} />
            )
          ) : route.view === 'class' ? (
            <HomeroomClassDetail
              key={route.classId}
              classId={route.classId}
              tab={route.tab}
              initialDate={location.date}
              session={session}
              nav={nav}
            />
          ) : route.view === 'student' ? (
            <HomeroomStudentQueryErrorBoundary onBack={nav.overview}>
              <HomeroomStudentDetail key={route.studentId} studentId={route.studentId} nav={nav} />
            </HomeroomStudentQueryErrorBoundary>
          ) : null}
        </HomeroomViewErrorBoundary>
      )}
    </section>
  );
}

function Forbidden({ text, onBack }) {
  return (
    <div className="hr-panel hr-error-panel" role="alert">
      <span className="hr-empty-icon"><Icon name="alert" size={24} /></span>
      <h2>Không có quyền truy cập</h2>
      <p>{text}</p>
      <button type="button" className="primary-button" onClick={onBack}>Về tổng quan</button>
    </div>
  );
}

/** Năm học & ngày nghỉ lễ được quản lý tại Thiết lập tối cao › Thiết lập năm học (chỉ Admin). */
function EmptySchoolYearState({ isAdmin }) {
  const openSettings = () => {
    window.history.pushState({}, '', pathnameForMenu('school-years'));
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  return (
    <div className="hr-panel hr-error-panel">
      <span className="hr-empty-icon"><Icon name="calendar" size={24} /></span>
      <h2>Chưa cấu hình năm học</h2>
      {isAdmin ? (
        <>
          <p>Tạo năm học và chọn năm học mặc định trong Thiết lập tối cao › Thiết lập năm học.</p>
          <button type="button" className="primary-button" onClick={openSettings}>
            Mở Thiết lập năm học
          </button>
        </>
      ) : (
        <p>Vui lòng liên hệ quản trị viên để tạo năm học trước khi sử dụng Lớp học.</p>
      )}
    </div>
  );
}
