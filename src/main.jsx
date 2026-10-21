import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
import { Authenticated, AuthLoading, Unauthenticated, useAction, useMutation, useQuery, ConvexReactClient } from 'convex/react';
import { anyApi } from 'convex/server';
import '@fontsource-variable/montserrat';
import '@fontsource-variable/montserrat/wght-italic.css';
import './styles.css';
import WorkReportsView from './reports/WorkReportsView';
import DutyReportsView from './reports/DutyReportsView';
import SharedDutyScheduleView from './duties/SharedDutyScheduleView';
import { isDutyWeekNotification } from './duties/dutyWeekApproval.js';
import DutyWorkspaceTabs from './duties/DutyWorkspaceTabs';
import WorkHub from './work/WorkHub';
import DocumentTypeSettings from './settings/DocumentTypeSettings';
import SchoolYearSettings from './settings/SchoolYearSettings';
import DisplaySettings from './settings/DisplaySettings';
import DesignLibraryView from './settings/DesignLibraryView';
import UserBulkImport from './settings/UserBulkImport';
import './settings/userBulkImport.css';
import NotificationsView from './notifications/NotificationsView';
import { DUTY_NOTIFICATION_FOCUS_TYPES, menuForNotification, useNotificationFocus } from './notifications/useNotificationFocus';
import { ACCOUNT_MENU_IDS, isAccountMenu, isSidebarPrimaryMenu, pathnameForMenu, pathnameForReportSection, routeForPathname, dutiesPathname, chatPathname, titleForAccountMenu } from './navigationRoutes';
import { parseDutyPath } from './duties/dutyRoutes';
import AccountDeletionPage from './privacy/AccountDeletionPage';
import PrivacyPolicyPage from './privacy/PrivacyPolicyPage';
import { isPublicAccountDeletionPath, isPublicPrivacyPath } from './privacy/privacyPolicy';
import PeopleReviewView from './peopleReview/PeopleReviewView';
import StaffFaultsView from './peopleReview/StaffFaultsView';
import HomeroomRouter from './homeroom/HomeroomRouter';
import AttendancePage from './attendance/AttendancePage';
import DevicesPanel from './profile/DevicesPanel';
import { describeWebDevice } from './profile/deviceSession';
import { convexErrorText, messageFor } from './lib/appErrorMessage';
import CollapsibleMultiCheckList from './lib/CollapsibleMultiCheckList.jsx';
import StarRating from './lib/StarRating.jsx';
import AccountMenu from './profile/AccountMenu.jsx';
import { ChangePasswordView, DevicesView, ProfileView } from './profile/ProfilePages.jsx';
import { OwnAvatarProvider } from './profile/useOwnAvatar.jsx';
import { ChatAutoOpenProvider } from './lib/chatAutoOpen.jsx';
import './management/managementTheme.css';
import './duties/duties.css';
import DutyBulkImport from './duties/DutyBulkImport';
import DutyChangeHistory from './duties/DutyChangeHistory';
import DutyCreatePreview from './duties/DutyCreatePreview';
import { EditActionConfirm } from './lib/ConfirmActionModal';
import DutyEditorFields from './duties/DutyEditorFields';
import {
  applyDutyEndDateTime,
  applyDutyFormField,
  applyDutyStartDateTime,
  dutyFormFromItem,
  dutyFormHasParticipants,
  dutyPayloadFromForm,
  emptyDutyForm,
} from './duties/dutyDisplay';
import './profile/profile.css';
import './profile/devices.css';
import './settings/displaySettings.css';
import './notifications/notifications.css';
import { navIconFor } from './navIcons';
import ChatHub from './chat/ChatHub';

const configuredConvexUrl = import.meta.env.VITE_CONVEX_URL;
const publicConvexUrl =
  configuredConvexUrl ||
  (window.location.hostname === 'lvt.vscgroup.io.vn' ? window.location.origin : null);
const convex = publicConvexUrl ? new ConvexReactClient(publicConvexUrl) : null;

const PRIMARY_MENUS = [
  ['reports', 'Báo cáo'],
  ['notifications', 'Thông báo'],
  ['chat', 'Trao đổi'],
  ['duties', 'Lịch công tác'],
  ['work', 'Công việc'],
  ['homeroom', 'Lớp chủ nhiệm'],
  ['attendance', 'Điểm danh'],
  ['people-review', 'Đánh giá nhân sự'],
  ['staff-faults', 'Ghi nhận lỗi'],
];
const SYSTEM_MANAGEMENT_MENUS = [];
const SUPREME_SETTINGS = [
  ['users', 'Thiết lập người dùng'],
  ['departments', 'Thiết lập phòng ban'],
  ['roles', 'Thiết lập nhóm quyền'],
  ['positions', 'Thiết lập chức vụ'],
  ['document-types', 'Thiết lập loại văn bản'],
  ['school-years', 'Thiết lập năm học'],
  ['display-settings', 'Thiết lập hiển thị'],
  ['design-library', 'Thư viện giao diện'],
];
const ROLE_LABELS = { admin: 'Administrator', moderator: 'Moderator', user: 'User' };
const ACCESS_LABELS = {
  hidden: 'Ẩn',
  view: 'Xem',
  view_all: 'Xem tối cao',
  supervisor: 'Giám thị',
  edit: 'Xem',
};
const MATRIX_ACCESS_LEVELS = ['hidden', 'view', 'view_all', 'supervisor'];
/** Giám thị chỉ có ở menu Điểm danh; menu Điểm danh chỉ có Ẩn / Giám thị (backend kiểm tra lại). */
function isMatrixLevelAvailable(menuId, level) {
  if (menuId === 'attendance') return level === 'hidden' || level === 'supervisor';
  return level !== 'supervisor';
}

function signInMessageFor(error) {
  const raw = convexErrorText(error);
  if (/^\[Request ID:[^\]]+\]\s*Server Error\s*$/i.test(raw.trim()) || /^Server Error\s*$/i.test(raw.trim())) {
    return 'Không thể đăng nhập. Hãy kiểm tra email, mật khẩu rồi thử lại.';
  }
  return messageFor(error);
}

function AuthenticatedApp() {
  const session = useQuery(anyApi.users.sessionContext);
  const registerDevice = useMutation(anyApi.sessions.registerCurrent);
  const touchSession = useMutation(anyApi.sessions.touchCurrent);

  useEffect(() => {
    if (!session?.user || session.user.status !== 'active') return;
    const device = describeWebDevice();
    void registerDevice(device).catch(() => {});
    const timer = window.setInterval(() => {
      void touchSession({}).catch(() => {});
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [session?.user?._id, session?.user?.status, registerDevice, touchSession]);

  if (session === undefined) return <LoadingView label="Đang kiểm tra quyền truy cập…" />;
  if (!session?.user) return <AccessDeniedView message="Phiên đăng nhập không gắn với hồ sơ người dùng hợp lệ." />;
  if (session.user.loginLockedAt) {
    return (
      <AccessDeniedView message="Tài khoản đã bị khóa do đăng nhập sai quá số lần. Vui lòng liên hệ quản trị viên để được mở khóa." />
    );
  }
  if (session.user.status !== 'active') {
    return <AccessDeniedView message="Tài khoản này đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên." />;
  }
  if (session.user.mustChangePassword) {
    return (
      <main className="auth-page">
        <div className="auth-card password-gate-card">
          <MustChangePasswordView />
        </div>
      </main>
    );
  }
  return <AppShell session={session} />;
}

function AppShell({ session }) {
  const { signOut } = useAuthActions();
  const { user, isAdmin, isModerator, isOperationalManager, menuAccess } = session;
  const canManageOperations = Boolean(isOperationalManager || isAdmin || isModerator);
  // UX hint for the Lịch công tác page actions; duties.create re-checks on the server.
  const canCreateDuties = canManageOperations || Boolean(session.canCreateDuties);
  const workBadge = useQuery(anyApi.work.badge, canManageOperations || menuAccess?.work !== 'hidden' ? {} : 'skip');
  const chatUnread = useQuery(anyApi.chatHub.unreadTotal, {});
  const canUseNotifications = canManageOperations || menuAccess?.notifications !== 'hidden';
  const notificationFeed = useQuery(
    anyApi.notifications.feed,
    canUseNotifications ? {} : 'skip',
  );
  const visiblePrimaryMenus = useMemo(() => {
    if (canManageOperations) return PRIMARY_MENUS;
    // Trao đổi and Công việc ("Việc của tôi") are open to every active account.
    return PRIMARY_MENUS.filter(([id]) => id === 'chat' || id === 'work' || (menuAccess?.[id] && menuAccess[id] !== 'hidden'));
  }, [canManageOperations, menuAccess]);
  const canUseChat = visiblePrimaryMenus.some(([id]) => id === 'chat');
  const sidebarPrimaryMenus = useMemo(
    () => visiblePrimaryMenus.filter(([id]) => isSidebarPrimaryMenu(id)),
    [visiblePrimaryMenus],
  );

  const defaultActive = canManageOperations
    ? 'reports'
    : sidebarPrimaryMenus[0]?.[0] || 'profile';
  const initialRoute = routeForPathname(window.location.pathname);
  const [active, setActive] = useState(initialRoute?.menu || defaultActive);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [reportSection, setReportSection] = useState(initialRoute?.reportSection || 'work');
  const [dutyPath, setDutyPath] = useState(
    initialRoute && 'dutyPath' in initialRoute && initialRoute.dutyPath
      ? initialRoute.dutyPath
      : dutiesPathname(),
  );
  const [chatPath, setChatPath] = useState(
    initialRoute?.menu === 'chat' && initialRoute.chatPath ? initialRoute.chatPath : chatPathname(),
  );
  const [focusTarget, setFocusTarget] = useState(null);
  const dutyRoute = parseDutyPath(dutyPath) || { view: 'personal', dutyId: undefined };
  const dutyListViewRef = useRef(dutyRoute.view === 'shared' ? 'shared' : 'personal');

  useEffect(() => {
    if (active !== 'duties' || !dutyPath) return;
    if (window.location.pathname === '/bao-cao/cong-tac' && dutyPath !== window.location.pathname) {
      window.history.replaceState({}, '', dutyPath);
    }
  }, [active, dutyPath]);

  const allowedMenus = useMemo(() => new Set([
    ...visiblePrimaryMenus.map(([id]) => id),
    ...(canManageOperations ? SYSTEM_MANAGEMENT_MENUS.map(([id]) => id) : []),
    ...(isAdmin ? SUPREME_SETTINGS.map(([id]) => id) : []),
    ...ACCOUNT_MENU_IDS,
    'settings',
  ]), [canManageOperations, isAdmin, visiblePrimaryMenus]);

  useEffect(() => {
    const currentRoute = routeForPathname(window.location.pathname);
    if (!allowedMenus.has(active) || !currentRoute || !allowedMenus.has(currentRoute.menu)) {
      setActive(defaultActive);
      setReportSection('work');
      window.history.replaceState({}, '', pathnameForMenu(defaultActive));
    }
  }, [active, allowedMenus, defaultActive]);

  useEffect(() => {
    const handlePopState = () => {
      const route = routeForPathname(window.location.pathname);
      if (route && allowedMenus.has(route.menu)) {
        setActive(route.menu);
        if (route.reportSection) setReportSection(route.reportSection);
        if ('dutyPath' in route && route.dutyPath) setDutyPath(route.dutyPath);
        if (route.menu === 'chat' && route.chatPath) setChatPath(route.chatPath);
      } else {
        setActive(defaultActive);
        setReportSection('work');
        window.history.replaceState({}, '', pathnameForMenu(defaultActive));
      }
      setMobileOpen(false);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [allowedMenus, defaultActive]);

  useEffect(() => {
    if (!mobileOpen) return undefined;

    const scrollY = window.scrollY;
    const previousBodyStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.documentElement.classList.add('mobile-nav-open');
    Object.assign(document.body.style, {
      position: 'fixed',
      top: `-${scrollY}px`,
      left: '0',
      right: '0',
      width: '100%',
      overflow: 'hidden',
    });
    document.documentElement.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.documentElement.classList.remove('mobile-nav-open');
      Object.assign(document.body.style, previousBodyStyle);
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [mobileOpen]);

  const title = useMemo(() => {
    if (active === 'settings') return titleForAccountMenu('profile');
    if (isAccountMenu(active)) return titleForAccountMenu(active);
    if (active === 'duties') {
      if (dutyRoute.view === 'create') return 'Tạo lịch công tác';
      if (dutyRoute.view === 'edit') return 'Sửa lịch công tác';
      return 'Lịch công tác';
    }
    const all = [...PRIMARY_MENUS, ...SYSTEM_MANAGEMENT_MENUS, ...SUPREME_SETTINGS];
    return all.find(([id]) => id === active)?.[1] || 'CRM Lê Văn Tám';
  }, [active, dutyRoute.view]);

  const choose = (id, { replace = false } = {}) => {
    setActive(id);
    if (id === 'reports') setReportSection('work');
    if (id === 'duties') setDutyPath(dutiesPathname());
    if (id === 'chat') setChatPath(chatPathname());
    const pathname = pathnameForMenu(id);
    if (window.location.pathname !== pathname) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', pathname);
      window.dispatchEvent(new Event('lvt:locationchange'));
    }
    setMobileOpen(false);
  };

  const chooseReportSection = (section) => {
    if (section === 'duties') {
      chooseDutyView('shared');
      return;
    }
    setActive('reports');
    setReportSection(section);
    const pathname = pathnameForReportSection(section);
    if (window.location.pathname !== pathname) window.history.pushState({}, '', pathname);
    setMobileOpen(false);
  };

  const chooseDutyView = (requestedView, extra = {}) => {
    // Closing the editor returns to whichever sheet opened it (cá nhân or chung).
    const view = requestedView === 'back' ? dutyListViewRef.current : requestedView;
    if (view === 'personal' || view === 'shared') dutyListViewRef.current = view;
    setActive('duties');
    const pathname = dutiesPathname({ view, dutyId: extra.dutyId });
    setDutyPath(pathname);
    if (window.location.pathname !== pathname) window.history.pushState({}, '', pathname);
    setMobileOpen(false);
  };

  const openChatThread = (kind, entityId) => {
    const pathname = chatPathname(kind && entityId ? { kind, entityId } : {});
    setActive('chat');
    setChatPath(pathname);
    if (window.location.pathname !== pathname) window.history.pushState({}, '', pathname);
    setMobileOpen(false);
  };

  const openChatEntity = (kind, entityId) => {
    if (kind === 'work') {
      setFocusTarget({
        menu: 'work',
        sourceType: 'work_chat',
        sourceId: String(entityId),
        openChat: false,
        token: Date.now(),
      });
      choose('work');
      return;
    }
    if (kind === 'duty') {
      setFocusTarget({
        menu: 'duties',
        sourceType: 'duty_chat',
        sourceId: String(entityId),
        openChat: false,
        token: Date.now(),
      });
      choose('duties');
    }
  };

  const openFromNotification = (item) => {
    const menu = menuForNotification(item);
    const isChat = item.sourceType === 'work_chat' || item.sourceType === 'duty_chat' || item.sourceType === 'group_chat';
    if (isChat) {
      const kind = item.sourceType === 'duty_chat' ? 'duty' : item.sourceType === 'group_chat' ? 'group' : 'work';
      setFocusTarget({
        menu: 'chat',
        sourceType: item.sourceType,
        sourceId: String(item.sourceId),
        openChat: true,
        token: Date.now(),
      });
      openChatThread(kind, String(item.sourceId));
      return;
    }
    setFocusTarget({
      menu,
      sourceType: item.sourceType,
      sourceId: String(item.sourceId),
      openChat: false,
      token: Date.now(),
    });
    if (isDutyWeekNotification(item)) {
      chooseDutyView('shared');
      return;
    }
    choose(menu);
  };

  const activeFocusTarget = focusTarget?.menu === active ? focusTarget : null;

  return (
    <OwnAvatarProvider user={user}>
    <ChatAutoOpenProvider target={activeFocusTarget}>
    <div className={`shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside
        className={`shell-sidebar ${mobileOpen ? 'is-open' : ''}`}
        aria-label="Menu điều hướng"
        {...(mobileOpen ? { role: 'dialog', 'aria-modal': true } : {})}
      >
        <div className="school-brand">
          <img src="/assets/logo-thcs-le-van-tam.png" alt="Logo Trường THCS Lê Văn Tám" />
          <div>
            <strong>
              Trường THCS
              <br />
              Lê Văn Tám
            </strong>
            <span>CRM nội bộ</span>
          </div>
        </div>
        <nav className="shell-nav" aria-label="Điều hướng CRM">
          <p className="nav-label">Chức năng chính</p>
          {visiblePrimaryMenus.length === 0 && !canManageOperations ? (
            <p className="nav-empty">Chưa được gán menu. Liên hệ quản trị viên.</p>
          ) : (
            sidebarPrimaryMenus.map(([id, label]) => (
              <React.Fragment key={id}>
                <NavButton
                  id={id}
                  label={label}
                  badge={id === 'work' ? workBadge?.count : id === 'chat' ? chatUnread?.count : 0}
                  active={active}
                  onClick={choose}
                />
                {id === 'reports' && active === 'reports' ? (
                  <ReportSubmenu
                    active={reportSection}
                    onChoose={chooseReportSection}
                  />
                ) : null}
              </React.Fragment>
            ))
          )}
          {canManageOperations && SYSTEM_MANAGEMENT_MENUS.length ? (
            <>
              <p className="nav-label admin-label">Quản trị hệ thống</p>
              {SYSTEM_MANAGEMENT_MENUS.map(([id, label]) => (
                <NavButton key={id} id={id} label={label} active={active} onClick={choose} nested />
              ))}
            </>
          ) : null}
          {isAdmin ? (
            <>
              <p className="nav-label admin-label">Thiết lập tối cao</p>
              {SUPREME_SETTINGS.map(([id, label]) => (
                <NavButton key={id} id={id} label={label} active={active} onClick={choose} nested />
              ))}
            </>
          ) : null}
        </nav>
        <div className="sidebar-note">
          <b>{ROLE_LABELS[user.role] || user.role}</b>
          <span>
            {isAdmin
              ? 'Toàn quyền hệ thống, bao gồm Thiết lập tối cao và quản lý tài khoản.'
              : isModerator
                ? 'Toàn quyền nghiệp vụ và Quản trị hệ thống; không truy cập Thiết lập tối cao.'
                : 'Quyền chức năng phụ thuộc nhóm quyền. Quên mật khẩu: liên hệ Administrator.'}
          </span>
        </div>
      </aside>
      {mobileOpen ? (
        <button
          type="button"
          className="mobile-nav-overlay"
          aria-label="Đóng menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <main className="shell-main">
        <header className="shell-header">
          <button
            type="button"
            className="sidebar-collapse-button"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={sidebarCollapsed ? 'Hiện menu bên trái' : 'Ẩn menu bên trái'}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? 'Hiện menu bên trái' : 'Ẩn menu bên trái'}
          >
            {sidebarCollapsed ? '›' : '‹'}
          </button>
          <button className="mobile-menu" onClick={() => setMobileOpen((open) => !open)} aria-label="Mở menu" aria-expanded={mobileOpen}>
            ☰
          </button>
          <div>
            <p className="eyebrow">CRM Lê Văn Tám</p>
            <h1>{title}</h1>
          </div>
          <div className="header-user">
            {canUseChat ? (
              <ChatHeaderButton
                active={active === 'chat'}
                unreadCount={chatUnread?.count || 0}
                onClick={() => choose('chat')}
              />
            ) : null}
            {canUseNotifications ? (
              <NotificationBell
                data={notificationFeed}
                onViewAll={() => choose('notifications')}
                onOpenItem={openFromNotification}
              />
            ) : null}
            <AccountMenu onChoose={choose} onSignOut={() => void signOut()} />
          </div>
        </header>
        {active === 'users' && isAdmin ? (
          <UserManagement />
        ) : active === 'departments' && isAdmin ? (
          <DepartmentManagement />
        ) : active === 'locations' && isAdmin ? (
          <LocationManagement />
        ) : active === 'roles' && isAdmin ? (
          <PermissionGroupManagement />
        ) : active === 'positions' && isAdmin ? (
          <PositionManagement />
        ) : active === 'document-types' && isAdmin ? (
          <DocumentTypeSettings />
        ) : active === 'school-years' && isAdmin ? (
          <SchoolYearSettings />
        ) : active === 'display-settings' && isAdmin ? (
          <DisplaySettings />
        ) : active === 'design-library' && isAdmin ? (
          <DesignLibraryView />
        ) : active === 'notifications' ? (
          <NotificationsView data={notificationFeed} onOpenItem={openFromNotification} />
        ) : active === 'duties' ? (
          dutyRoute.view === 'shared' ? (
            <SharedDutyScheduleView
              currentUserId={user._id}
              canCreate={canCreateDuties}
              onChooseView={chooseDutyView}
              focusWeek={
                isDutyWeekNotification(activeFocusTarget)
                  ? { weekStart: activeFocusTarget.sourceId, token: activeFocusTarget.token }
                  : null
              }
            />
          ) : canManageOperations ? (
            <DutiesAdminView
              currentUserId={user._id}
              canCreate={canCreateDuties}
              allowManage
              focusTarget={activeFocusTarget}
              dutyPage={dutyRoute.view}
              editDutyId={dutyRoute.dutyId}
              onDutyNavigate={chooseDutyView}
            />
          ) : (
            <DutiesUserView
              access={menuAccess?.duties || 'view'}
              currentUserId={user._id}
              canCreate={canCreateDuties}
              focusTarget={activeFocusTarget}
              dutyPage={dutyRoute.view}
              editDutyId={dutyRoute.dutyId}
              onDutyNavigate={chooseDutyView}
            />
          )
        ) : active === 'work' ? (
          <WorkHub
            focusTarget={activeFocusTarget}
            workHidden={!canManageOperations && (menuAccess?.work || 'hidden') === 'hidden'}
          />
        ) : active === 'chat' ? (
          <ChatHub path={chatPath} onNavigate={openChatThread} onOpenEntity={openChatEntity} />
        ) : active === 'people-review' ? (
          <PeopleReviewView />
        ) : active === 'staff-faults' ? (
          <StaffFaultsView />
        ) : active === 'reports' ? (
          <WorkReportsView />
        ) : active === 'homeroom' ? (
          <HomeroomRouter session={session} />
        ) : active === 'attendance' ? (
          <AttendancePage />
        ) : active === 'profile' || (active === 'settings' && !isAdmin) ? (
          <ProfileView session={session} />
        ) : active === 'change-password' ? (
          <ChangePasswordView />
        ) : active === 'devices' ? (
          <DevicesView />
        ) : (
          <PlaceholderView
            title={title}
            access={canManageOperations ? 'view_all' : menuAccess?.[active] || 'view'}
            isAdmin={canManageOperations}
          />
        )}
      </main>
    </div>
    </ChatAutoOpenProvider>
    </OwnAvatarProvider>
  );
}

function ChatHeaderButton({ active = false, unreadCount = 0, onClick }) {
  return (
    <button
      type="button"
      className={`header-chat-button${active ? ' is-active' : ''}${unreadCount > 0 ? ' has-unread' : ''}`}
      onClick={onClick}
      aria-label={`Trao đổi${unreadCount ? `, ${unreadCount} chưa đọc` : ''}`}
      aria-current={active ? 'page' : undefined}
      title="Trao đổi"
    >
      {navIconFor('chat')}
      {unreadCount > 0 ? <span className="header-chat-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
    </button>
  );
}

function NotificationBell({ data, onViewAll, onOpenItem }) {
  const markRead = useMutation(anyApi.notifications.markRead);
  const [open, setOpen] = useState(false);
  const latestItems = (data?.items || []).slice(0, 10);
  const unreadCount = data?.unreadCount || 0;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const openItem = (item) => {
    if (!item.read) void markRead({ notificationKey: item.key });
    setOpen(false);
    onOpenItem?.(item);
  };

  return (
    <div className="notification-bell-wrap">
      <button
        type="button"
        className={`notification-bell-button ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={`Thông báo${unreadCount ? `, ${unreadCount} chưa đọc` : ''}`}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 ? <span className="notification-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>

      {open ? (
        <div className="notification-popover">
          <header>
            <strong>Thông báo gần nhất</strong>
            <span>{unreadCount} CHƯA ĐỌC</span>
          </header>
          {latestItems.length ? (
            <div className="notification-popover-list">
              {latestItems.map((item) => (
                <button
                  type="button"
                  className={`notification-popover-item ${item.read ? '' : 'unread'}${item.sourceType === 'completion_rejected' ? ' is-rejection' : ''}`}
                  key={item.key}
                  title={item.sourceType === 'group_chat' || item.kind === 'group' ? 'Mở nhóm trao đổi' : item.kind === 'duty' ? 'Mở công tác này' : item.kind === 'todo' ? 'Mở Việc của tôi' : 'Mở công việc này'}
                  onClick={() => openItem(item)}
                >
                  <span>{item.sourceType === 'group_chat' || item.kind === 'group' ? 'Nhóm' : item.kind === 'duty' ? 'Công tác' : item.kind === 'todo' ? 'Việc của tôi' : item.sourceType === 'completion_rejected' ? 'Từ chối hoàn thành' : 'Công việc'} · {item.milestoneLabel}</span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="notification-popover-empty">Hiện chưa có thông báo gần đến hạn.</div>
          )}
          <button
            type="button"
            className="notification-popover-footer"
            onClick={() => {
              setOpen(false);
              onViewAll();
            }}
          >
            Xem toàn bộ
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ReportSubmenu({ active, onChoose }) {
  return (
    <div className="report-submenu" aria-label="Loại báo cáo">
      <button type="button" className={active === 'work' ? 'active' : ''} onClick={() => onChoose('work')}>
        <span className="nav-icon">{navIconFor('work')}</span> Công việc
      </button>
    </div>
  );
}

function NavButton({ id, label, active, onClick, nested = false, badge = 0 }) {
  return (
    <button type="button" className={`shell-nav-button ${active === id ? 'active' : ''} ${nested ? 'nested' : ''}`} onClick={() => onClick(id)}>
      <span className="nav-icon">{navIconFor(id)}</span>
      <span>{label}</span>
      {badge > 0 ? <b className="nav-badge">{badge > 99 ? '99+' : badge}</b> : null}
    </button>
  );
}

function DutiesAdminView({
  currentUserId,
  canCreate = true,
  allowManage = true,
  focusTarget = null,
  dutyPage = 'personal',
  editDutyId = null,
  onDutyNavigate,
}) {
  const editorOpen = dutyPage === 'create' || dutyPage === 'edit';
  const options = useQuery(anyApi.duties.formOptions, allowManage && editorOpen ? {} : 'skip');
  const listData = useQuery(anyApi.duties.listAdmin, editorOpen ? {} : 'skip');
  const list = listData?.duties || [];
  const create = useMutation(anyApi.duties.create);
  const update = useMutation(anyApi.duties.update);
  const [form, setForm] = useState(emptyDutyForm);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editConfirm, setEditConfirm] = useState(null);
  const editorRef = useRef(null);
  const { pending, feedback, setFeedback, run } = useFeedback();
  const missingEdit = dutyPage === 'edit' && listData !== undefined &&
    !list.some((item) => String(item._id) === String(editDutyId));

  useNotificationFocus(focusTarget, {
    acceptSourceTypes: DUTY_NOTIFICATION_FOCUS_TYPES,
  });

  const setField = (field, value) => {
    setForm((prev) => applyDutyFormField(prev, field, value));
  };

  const startEdit = (item) => {
    if (onDutyNavigate) {
      onDutyNavigate('edit', { dutyId: item._id });
      return;
    }
    setEditing(item);
    setImportOpen(false);
    setPreviewOpen(false);
    setForm(dutyFormFromItem(item));
  };

  const closeEditor = () => {
    setEditing(null);
    setPreviewOpen(false);
    setEditConfirm(null);
    setForm(emptyDutyForm());
    onDutyNavigate?.('back');
  };

  const openCreateEditor = () => {
    setImportOpen(false);
    if (onDutyNavigate) {
      onDutyNavigate('create');
      return;
    }
  };

  const openImportPanel = () => {
    setImportOpen(true);
    onDutyNavigate?.('personal');
  };

  useEffect(() => {
    if (dutyPage === 'create') {
      setEditing(null);
      setForm(emptyDutyForm());
      setImportOpen(false);
      setPreviewOpen(false);
      return;
    }
    if (dutyPage !== 'edit' || !editDutyId || listData === undefined) return;
    const item = list.find((row) => String(row._id) === String(editDutyId));
    if (!item) return;
    setEditing(item);
    setForm(dutyFormFromItem(item));
    setImportOpen(false);
  }, [dutyPage, editDutyId, listData === undefined]);

  const persistDuty = async () => {
    if (pending === 'save') return;
    const payload = dutyPayloadFromForm(form);
    if (editing) {
      const ok = await run('save', () => update({ id: editing._id, ...payload }), 'Đã cập nhật công tác.');
      if (ok) closeEditor();
      return;
    }
    setPreviewOpen(false);
    // Văn thư may leave Thành phần empty and add it before sending the week to BGH.
    const ok = await run('save', () => create(payload), 'Đã thêm công tác vào lịch tuần. Nhớ nộp Ban Giám hiệu duyệt ở Lịch công tác chung.');
    if (ok) closeEditor();
  };

  const submit = (event) => {
    event.preventDefault();
    if (editing) {
      setEditConfirm('save');
      return;
    }
    setPreviewOpen(true);
  };

  useEffect(() => {
    if (!editorOpen) return;
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [editorOpen]);

  if (editorOpen && ((allowManage && options === undefined) || listData === undefined)) {
    return <LoadingView label="Đang tải công tác…" />;
  }

  return (
    <section className="work-management duty-workspace">
      {editorOpen ? (
        <div className="duty-editor-page-bar">
          <button type="button" className="work-ghost-button" onClick={closeEditor}>
            ← Quay lại lịch công tác
          </button>
        </div>
      ) : (
        <DutyWorkspaceTabs
          view="personal"
          onChoose={onDutyNavigate}
          canCreate={allowManage && canCreate}
          onCreate={openCreateEditor}
          onImport={openImportPanel}
        />
      )}
      {feedback.text && !editorOpen ? (
        <div className={`work-feedback ${feedback.type}`} role="status" aria-live="polite">
          {feedback.text}
        </div>
      ) : null}

      {allowManage && importOpen && !editorOpen ? (
        <DutyBulkImport onClose={() => setImportOpen(false)} />
      ) : null}

      {editorOpen && missingEdit ? (
        <p className="work-feedback error" role="status">Công tác này không còn tồn tại hoặc bạn không có quyền sửa.</p>
      ) : null}

      {allowManage && editorOpen && !missingEdit ? <form ref={editorRef} className="work-editor duty-modern-editor" onSubmit={submit}>
        <div className="work-editor-title">
          <div>
            <span>{editing ? 'CẬP NHẬT LỊCH' : 'LỊCH MỚI'}</span>
            <h3>{editing ? 'Sửa công tác' : 'Tạo công tác'}</h3>
          </div>
          <div className="duty-editor-heading-actions">
            {editing ? (
              <button type="button" className="work-ghost-button" onClick={() => setEditConfirm('cancel')}>
                Hủy chỉnh sửa
              </button>
            ) : null}
            <button type="button" className="duty-editor-close" onClick={closeEditor} aria-label="Đóng biểu mẫu">
              <span aria-hidden="true">×</span> Đóng
            </button>
          </div>
        </div>

        <DutyEditorFields
          form={form}
          onField={setField}
          onStartDateTime={(date, time) => setForm((prev) => applyDutyStartDateTime(prev, date, time))}
          onEndDateTime={(date, time) => setForm((prev) => applyDutyEndDateTime(prev, date, time))}
        >
        <div className="duty-field">
          <span className="duty-field-label">Phòng ban tham gia</span>
          <CollapsibleMultiCheckList
            title="Chọn phòng ban"
            options={options.departments}
            values={form.departmentIds}
            onChange={(ids) => setField('departmentIds', ids)}
            getLabel={(d) => `${d.name}${d.code ? ` (${d.code})` : ''}`}
            searchPlaceholder="Tìm phòng ban…"
            emptyText="Chưa có phòng ban."
          />
        </div>

        <div className="duty-field">
          <span className="duty-field-label">Cá nhân tham gia</span>
          <CollapsibleMultiCheckList
            title="Chọn cá nhân"
            options={options.users}
            values={form.participantUserIds}
            onChange={(ids) => setField('participantUserIds', ids)}
            getLabel={(u) => `${u.name || '—'} · ${u.email || ''}`}
            searchPlaceholder="Tìm theo tên, email…"
            emptyText="Chưa có người dùng."
          />
        </div>
        </DutyEditorFields>

        {feedback.text ? (
          <div className={`work-feedback ${feedback.type}`} role="status" aria-live="polite">
            {feedback.text}
          </div>
        ) : null}
        {editing ? <DutyChangeHistory dutyId={editing._id} /> : null}
        <div className="work-editor-actions duty-editor-actions">
          <button
            type="button"
            className="work-ghost-button"
            onClick={editing ? () => setEditConfirm('cancel') : () => setForm(emptyDutyForm())}
          >
            {editing ? 'Hủy sửa' : 'Xóa biểu mẫu'}
          </button>
          <button className="work-primary-button" disabled={Boolean(pending)}>
            {pending === 'save' ? (editing ? 'Đang lưu…' : 'Đang tạo…') : editing ? 'Lưu thay đổi' : 'Tạo'}
          </button>
        </div>
      </form> : null}

      {previewOpen ? (
        <DutyCreatePreview
          form={form}
          catalogs={options}
          pending={pending === 'save'}
          onCancel={() => setPreviewOpen(false)}
          onConfirm={() => void persistDuty()}
        />
      ) : null}

      <EditActionConfirm
        action={editConfirm}
        onDismiss={() => setEditConfirm(null)}
        onConfirmCancel={() => closeEditor()}
        onConfirmSave={() => {
          setEditConfirm(null);
          void persistDuty();
        }}
      />

      {!editorOpen ? (
        <DutyReportsView
          currentUserId={currentUserId}
          onEdit={(event) => startEdit({ _id: event._id })}
          focusDutyId={focusTarget?.sourceId}
          openChat={Boolean(focusTarget?.openChat && focusTarget?.sourceType === 'duty_chat')}
          focusToken={focusTarget?.token}
        />
      ) : null}
    </section>
  );
}

function DutiesUserView({
  access,
  currentUserId,
  canCreate: canCreateHint = false,
  focusTarget = null,
  dutyPage = 'personal',
  editDutyId = null,
  onDutyNavigate,
}) {
  const editorOpen = dutyPage === 'create' || dutyPage === 'edit';
  const data = useQuery(anyApi.duties.listMine, editorOpen ? {} : 'skip');
  const options = useQuery(anyApi.duties.formOptions, editorOpen ? {} : 'skip');
  const create = useMutation(anyApi.duties.create);
  const update = useMutation(anyApi.duties.update);
  const { pending, feedback, setFeedback, run } = useFeedback();
  const canCreate = Boolean(data?.canCreate);
  const [form, setForm] = useState(emptyDutyForm);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editConfirm, setEditConfirm] = useState(null);
  const editorRef = useRef(null);
  const duties = data?.duties;
  const missingEdit = dutyPage === 'edit' && data !== undefined &&
    !(duties || []).some((item) => String(item._id) === String(editDutyId));

  useNotificationFocus(focusTarget, { acceptSourceTypes: DUTY_NOTIFICATION_FOCUS_TYPES });

  const setField = (field, value) => {
    setForm((prev) => applyDutyFormField(prev, field, value));
  };

  const startEdit = (item) => {
    if (onDutyNavigate) {
      onDutyNavigate('edit', { dutyId: item._id });
      return;
    }
    setEditing(item);
    setImportOpen(false);
    setPreviewOpen(false);
    setForm(dutyFormFromItem(item));
  };

  const closeEditor = () => {
    setEditing(null);
    setPreviewOpen(false);
    setEditConfirm(null);
    setForm(emptyDutyForm());
    onDutyNavigate?.('back');
  };

  const openCreateEditor = () => {
    setImportOpen(false);
    onDutyNavigate?.('create');
  };

  const openImportPanel = () => {
    setImportOpen(true);
    onDutyNavigate?.('personal');
  };

  useEffect(() => {
    if (dutyPage === 'create') {
      if (data && !canCreate) {
        onDutyNavigate?.('personal');
        return;
      }
      setEditing(null);
      setForm(emptyDutyForm());
      setImportOpen(false);
      setPreviewOpen(false);
      return;
    }
    if (dutyPage !== 'edit' || !editDutyId || data === undefined) return;
    const item = (duties || []).find((row) => String(row._id) === String(editDutyId));
    if (!item) return;
    setEditing(item);
    setForm(dutyFormFromItem(item));
    setImportOpen(false);
  }, [dutyPage, editDutyId, data === undefined, canCreate]);

  const persistDuty = async () => {
    if (pending === 'save') return;
    const includeDepartments = Boolean(options?.isOps);
    const payload = dutyPayloadFromForm(form, { includeDepartments });
    if (editing) {
      const ok = await run('save', () => update({ id: editing._id, ...payload }), 'Đã cập nhật công tác.');
      if (ok) closeEditor();
      return;
    }
    setPreviewOpen(false);
    if (!includeDepartments && !dutyFormHasParticipants(form, { includeDepartments })) {
      setFeedback({ type: 'error', text: 'Vui lòng chọn phòng ban, cá nhân tham gia, hoặc điền thành phần khác.' });
      return;
    }
    const ok = await run('save', () => create(payload), 'Đã tạo công tác.');
    if (ok) closeEditor();
  };

  const submit = (event) => {
    event.preventDefault();
    if (editing) {
      setEditConfirm('save');
      return;
    }
    if (!options?.isOps && !dutyFormHasParticipants(form, { includeDepartments: false })) {
      setFeedback({ type: 'error', text: 'Vui lòng chọn phòng ban, cá nhân tham gia, hoặc điền thành phần khác.' });
      return;
    }
    setPreviewOpen(true);
  };

  if (editorOpen && (data === undefined || options === undefined)) {
    return <LoadingView label="Đang tải danh sách công tác…" />;
  }
  return (
    <section className="work-user-view duty-workspace">
      {editorOpen ? (
        <div className="duty-editor-page-bar">
          <button type="button" className="work-ghost-button" onClick={closeEditor}>
            ← Quay lại lịch công tác
          </button>
        </div>
      ) : (
        <DutyWorkspaceTabs
          view="personal"
          onChoose={onDutyNavigate}
          canCreate={canCreateHint}
          onCreate={openCreateEditor}
          onImport={openImportPanel}
        />
      )}

      {importOpen && !editorOpen ? (
        <DutyBulkImport onClose={() => setImportOpen(false)} />
      ) : null}

      {editorOpen && missingEdit ? (
        <p className="work-feedback error" role="status">Công tác này không còn tồn tại hoặc bạn không có quyền sửa.</p>
      ) : null}

      {editorOpen && !missingEdit && options ? (
        <form ref={editorRef} className="work-editor duty-modern-editor" onSubmit={submit}>
          <div className="work-editor-title">
            <div>
              <span>{editing ? 'CẬP NHẬT LỊCH' : 'LỊCH MỚI'}</span>
              <h3>{editing ? 'Sửa công tác' : 'Tạo công tác'}</h3>
            </div>
            <button type="button" className="duty-editor-close" onClick={closeEditor} aria-label="Đóng biểu mẫu">
              <span aria-hidden="true">×</span> Đóng
            </button>
          </div>
          <DutyEditorFields
            form={form}
            onField={setField}
            onStartDateTime={(date, time) => setForm((prev) => applyDutyStartDateTime(prev, date, time))}
            onEndDateTime={(date, time) => setForm((prev) => applyDutyEndDateTime(prev, date, time))}
          >
          <div className="duty-field">
            <span className="duty-field-label">Người tham gia</span>
            <CollapsibleMultiCheckList
              title="Chọn người tham gia"
              options={options.users}
              values={form.participantUserIds}
              onChange={(ids) => setField('participantUserIds', ids)}
              getLabel={(u) => `${u.name || '—'} · ${u.email || ''}`}
              searchPlaceholder="Tìm theo tên, email…"
              emptyText="Chưa có người tham gia trong phòng ban."
            />
          </div>
          </DutyEditorFields>
          {feedback.text ? (
            <div className={`work-feedback ${feedback.type}`} role="status" aria-live="polite">
              {feedback.text}
            </div>
          ) : null}
          {editing ? <DutyChangeHistory dutyId={editing._id} /> : null}
          <div className="work-editor-actions duty-editor-actions">
            {editing ? (
              <button type="button" className="work-ghost-button" onClick={() => setEditConfirm('cancel')}>
                Hủy sửa
              </button>
            ) : null}
            <button className="work-primary-button" disabled={Boolean(pending)}>
              {pending === 'save' ? (editing ? 'Đang lưu…' : 'Đang tạo…') : editing ? 'Lưu thay đổi' : 'Tạo'}
            </button>
          </div>
        </form>
      ) : null}

      {previewOpen ? (
        <DutyCreatePreview
          form={form}
          catalogs={{ ...options, includeDepartments: Boolean(options?.isOps) }}
          pending={pending === 'save'}
          onCancel={() => setPreviewOpen(false)}
          onConfirm={() => void persistDuty()}
        />
      ) : null}

      <EditActionConfirm
        action={editConfirm}
        onDismiss={() => setEditConfirm(null)}
        onConfirmCancel={() => closeEditor()}
        onConfirmSave={() => {
          setEditConfirm(null);
          void persistDuty();
        }}
      />

      {feedback.text && !editorOpen ? (
        <div className={`work-feedback ${feedback.type}`} role="status" aria-live="polite">
          {feedback.text}
        </div>
      ) : null}

      {!editorOpen ? (
        <DutyReportsView
          currentUserId={currentUserId}
          onEdit={(event) => startEdit({ _id: event._id })}
          focusDutyId={focusTarget?.sourceId}
          openChat={Boolean(focusTarget?.openChat && focusTarget?.sourceType === 'duty_chat')}
          focusToken={focusTarget?.token}
        />
      ) : null}
    </section>
  );
}

function useFeedback() {
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const run = async (name, operation, success) => {
    setPending(name);
    setFeedback({ type: '', text: '' });
    try {
      await operation();
      setFeedback({ type: 'success', text: success });
      return true;
    } catch (error) {
      console.error('CRM operation failed', name, error);
      setFeedback({ type: 'error', text: messageFor(error) });
      return false;
    } finally {
      setPending('');
    }
  };
  return { pending, feedback, setFeedback, run };
}

function emptyUserForm() {
  return {
    name: '',
    email: '',
    role: 'user',
    departmentId: '',
    permissionGroupId: '',
    positionId: '',
    temporaryPassword: '',
  };
}

function UserManagement() {
  const data = useQuery(anyApi.users.bootstrap);
  const lockoutSettings = useQuery(anyApi.loginSecurity.lockoutSettings);
  const updateLockoutSettings = useMutation(anyApi.loginSecurity.updateLockoutSettings);
  const unlockLogin = useMutation(anyApi.loginSecurity.unlockLogin);
  const create = useAction(anyApi.users.create);
  const update = useAction(anyApi.users.update);
  const setDisabled = useAction(anyApi.users.setDisabled);
  const remove = useAction(anyApi.users.remove);
  const resetPassword = useAction(anyApi.users.resetPassword);
  const [form, setForm] = useState(emptyUserForm);
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [sessionsUserId, setSessionsUserId] = useState(null);
  const [lockoutForm, setLockoutForm] = useState({ maxFailedAttempts: '5', windowMinutes: '15' });
  const { pending, feedback, run } = useFeedback();

  useEffect(() => {
    if (!lockoutSettings) return;
    setLockoutForm({
      maxFailedAttempts: String(lockoutSettings.maxFailedAttempts),
      windowMinutes: String(lockoutSettings.windowMinutes),
    });
  }, [lockoutSettings?.maxFailedAttempts, lockoutSettings?.windowMinutes]);

  const departments = (data?.departments || []).filter((d) => d.active);
  const groups = (data?.permissionGroups || []).filter((g) => g.active);
  const positions = (data?.positions || []).filter((p) => p.active);
  const users = data?.users || [];
  const systemRoles = data?.systemRoles || [
    { key: 'admin', name: 'Administrator' },
    { key: 'moderator', name: 'Moderator' },
    { key: 'user', name: 'User' },
  ];

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const usesPermissionGroup = form.role === 'user';
  const payload = () => ({
    name: form.name,
    email: form.email,
    role: form.role,
    departmentId: form.departmentId || undefined,
    // Administrator and Moderator have full feature access and ignore permission groups.
    permissionGroupId: usesPermissionGroup ? form.permissionGroupId || undefined : undefined,
    positionId: form.positionId || undefined,
  });

  const submitCreate = async (event) => {
    event.preventDefault();
    const ok = await run(
      'create',
      () => create({ ...payload(), temporaryPassword: form.temporaryPassword }),
      'Đã tạo tài khoản. Chuyển mật khẩu tạm thời qua kênh nội bộ an toàn.',
    );
    if (ok) setForm(emptyUserForm());
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    const ok = await run('update', () => update({ id: editing._id, ...payload() }), 'Đã cập nhật tài khoản.');
    if (ok) {
      setEditing(null);
      setForm(emptyUserForm());
    }
  };

  const startEdit = (item) => {
    setEditing(item);
    setResetting(null);
    setForm({
      name: item.name || '',
      email: item.email || '',
      role: ['admin', 'moderator', 'user'].includes(item.role) ? item.role : 'user',
      departmentId: item.departmentId || '',
      permissionGroupId: item.permissionGroupId || '',
      positionId: item.positionId || '',
      temporaryPassword: '',
    });
  };

  const confirmDelete = (item) => {
    if (window.confirm(`Xóa tài khoản ${item.email}? Thao tác này không thể hoàn tác.`)) {
      void run(`delete-${item._id}`, () => remove({ id: item._id }), 'Đã xóa tài khoản.');
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    const ok = await run(
      `reset-${resetting._id}`,
      () => resetPassword({ id: resetting._id, temporaryPassword: form.temporaryPassword }),
      'Đã đặt mật khẩu tạm thời, thu hồi phiên và yêu cầu đổi mật khẩu khi đăng nhập.',
    );
    if (ok) {
      setResetting(null);
      setForm(emptyUserForm());
    }
  };

  if (data === undefined) return <LoadingView label="Đang tải danh sách người dùng…" />;

  return (
    <section className="admin-view modern-management users-management">
      <div className="section-intro">
        <div>
          <span className="status-pill blue">Quản trị người dùng</span>
          <h2>Thiết lập người dùng</h2>
          <p>
            Administrator có toàn quyền; Moderator quản trị toàn bộ nghiệp vụ nhưng không truy cập Cài đặt tối cao; User phụ thuộc nhóm quyền.
          </p>
        </div>
      </div>
      <div className="user-settings-quick-grid">
        <UserBulkImport
          users={users}
          departments={data?.departments || []}
          positions={data?.positions || []}
          permissionGroups={data?.permissionGroups || []}
        />
        <div className="lockout-settings">
          <div className="lockout-settings-heading">
            <h3>Giới hạn đăng nhập thất bại</h3>
            <button
              type="button"
              className="field-help-trigger"
              aria-label="Thông tin giới hạn đăng nhập thất bại"
              title="Khi vượt số lần sai trong khung thời gian, tài khoản bị khóa và chỉ Administrator mở khóa thủ công. Người dùng sẽ thấy thông báo trên màn hình đăng nhập và nhận email hướng dẫn liên hệ admin."
            >
              !
            </button>
          </div>
          <form
            className="lockout-settings-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                'lockout',
                () =>
                  updateLockoutSettings({
                    maxFailedAttempts: Number(lockoutForm.maxFailedAttempts),
                    windowMinutes: Number(lockoutForm.windowMinutes),
                  }),
                'Đã cập nhật giới hạn đăng nhập thất bại.',
              );
            }}
          >
            <label>
              Số lần sai tối đa
              <input
                required
                type="number"
                min={1}
                max={50}
                value={lockoutForm.maxFailedAttempts}
                onChange={(e) => setLockoutForm((prev) => ({ ...prev, maxFailedAttempts: e.target.value }))}
              />
            </label>
            <label>
              Trong vòng (phút)
              <input
                required
                type="number"
                min={1}
                max={1440}
                value={lockoutForm.windowMinutes}
                onChange={(e) => setLockoutForm((prev) => ({ ...prev, windowMinutes: e.target.value }))}
              />
            </label>
            <button type="submit" className="primary-button" disabled={Boolean(pending)}>
              Lưu cấu hình
            </button>
          </form>
        </div>
      </div>
      <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
        {feedback.text}
      </div>
      <form className="admin-form" onSubmit={editing ? submitEdit : submitCreate}>
        <div className="form-heading">
          <strong>{editing ? `Chỉnh sửa: ${editing.email}` : 'Tạo tài khoản'}</strong>
          {editing && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditing(null);
                setForm(emptyUserForm());
              }}
            >
              Hủy chỉnh sửa
            </button>
          )}
        </div>
        <label>
          Họ tên
          <input required maxLength={120} value={form.name} onChange={(e) => setField('name', e.target.value)} />
        </label>
        <label>
          Email (đăng nhập)
          <input required type="email" autoComplete="off" value={form.email} onChange={(e) => setField('email', e.target.value)} disabled={Boolean(editing)} />
          <small>{editing ? 'Email đăng nhập không đổi qua form này.' : 'Email được chuẩn hóa (trim + lowercase) và phải duy nhất.'}</small>
        </label>
        <label>
          Vai trò
          <select
            value={form.role}
            onChange={(e) => {
              const role = e.target.value;
              setForm((prev) => ({
                ...prev,
                role,
                // Nhóm quyền chỉ áp dụng cho User.
                permissionGroupId: role === 'user' ? prev.permissionGroupId : '',
              }));
            }}
          >
            {systemRoles.map((role) => (
              <option key={role.key} value={role.key}>
                {role.name}
              </option>
            ))}
          </select>
          <small>Administrator và Moderator không dùng nhóm quyền. User phụ thuộc nhóm quyền được gán.</small>
        </label>
        <label>
          Phòng ban
          <select value={form.departmentId} onChange={(e) => setField('departmentId', e.target.value)}>
            <option value="">Chưa gán</option>
            {departments.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
          {form.role === 'moderator' ? (
            <small>
              Moderator chỉ thao tác trong phòng ban này ở Công việc, Báo cáo, Đánh giá nhân sự và Ghi nhận lỗi. Để trống = toàn trường.
            </small>
          ) : null}
        </label>
        <label>
          Chức vụ
          <select value={form.positionId} onChange={(e) => setField('positionId', e.target.value)}>
            <option value="">Chưa gán</option>
            {positions.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.level}★)
              </option>
            ))}
          </select>
        </label>
        <label className={!usesPermissionGroup ? 'field-disabled' : undefined}>
          Nhóm quyền
          <select
            value={usesPermissionGroup ? form.permissionGroupId : ''}
            onChange={(e) => setField('permissionGroupId', e.target.value)}
            disabled={!usesPermissionGroup}
          >
            <option value="">{usesPermissionGroup ? 'Chưa gán' : `Không áp dụng (${ROLE_LABELS[form.role]})`}</option>
            {usesPermissionGroup &&
              groups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
          </select>
          <small>
            {usesPermissionGroup
              ? 'Chỉ áp dụng cho User. Quyết định menu Ẩn / Xem / Xem tối cao / Giám thị (Giám thị chỉ dành cho Lớp chủ nhiệm).'
              : `${ROLE_LABELS[form.role]} có toàn quyền chức năng — không cần gán nhóm quyền.`}
          </small>
        </label>
        {!editing && (
          <label>
            Mật khẩu tạm thời
            <input required minLength={8} type="password" autoComplete="new-password" value={form.temporaryPassword} onChange={(e) => setField('temporaryPassword', e.target.value)} />
            <small>Ít nhất 8 ký tự. Không gửi qua email hoặc chat công khai.</small>
          </label>
        )}
        <button className="primary-button" disabled={Boolean(pending)}>
          {pending === 'create' ? 'Đang tạo…' : pending === 'update' ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : '+ Tạo tài khoản'}
        </button>
      </form>
      {resetting && (
        <form className="admin-form compact-form" onSubmit={submitReset}>
          <div className="form-heading">
            <strong>Đặt lại mật khẩu: {resetting.email}</strong>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setResetting(null);
                setForm(emptyUserForm());
              }}
            >
              Hủy
            </button>
          </div>
          <label>
            Mật khẩu tạm thời mới
            <input required minLength={8} type="password" autoComplete="new-password" value={form.temporaryPassword} onChange={(e) => setField('temporaryPassword', e.target.value)} />
          </label>
          <button className="primary-button" disabled={Boolean(pending)}>
            {pending ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
          </button>
        </form>
      )}
      <div className="user-table wide-table" aria-label="Danh sách người dùng">
        <div className="user-table-head user-table-head-5">
          <span>Người dùng</span>
          <span>Vai trò</span>
          <span>PB / Chức vụ / Nhóm quyền</span>
          <span>Trạng thái</span>
          <span>Thao tác</span>
        </div>
        {users.map((item) => (
          <div className="user-row user-row-5" key={item._id}>
            <div>
              <strong>{item.name}</strong>
              <span>{item.email}</span>
            </div>
            <div>
              <span className="role-tag">{ROLE_LABELS[item.role] || item.role}</span>
            </div>
            <div className="meta-stack">
              <span>{departments.find((d) => d._id === item.departmentId)?.name || 'Chưa gán PB'}</span>
              <span>{positions.find((p) => p._id === item.positionId)?.name || 'Chưa gán chức vụ'}</span>
              <span>{groups.find((g) => g._id === item.permissionGroupId)?.name || 'Chưa gán nhóm quyền'}</span>
            </div>
            <span
              className={
                item.loginLockedAt || item.status !== 'active' ? 'pending-tag' : 'live-tag'
              }
            >
              {item.loginLockedAt
                ? 'Khóa ĐN'
                : item.status === 'active'
                  ? item.mustChangePassword
                    ? 'Cần đổi MK'
                    : 'Hoạt động'
                  : item.status === 'disabled'
                    ? 'Đã khóa'
                    : item.status}
            </span>
            <div className="row-actions">
              <button type="button" onClick={() => startEdit(item)} disabled={Boolean(pending)}>
                Sửa
              </button>
              <button type="button" onClick={() => setResetting(item)} disabled={Boolean(pending) || !item.email}>
                Đặt lại MK
              </button>
              <button
                type="button"
                onClick={() => setSessionsUserId((prev) => (prev === item._id ? null : item._id))}
                disabled={Boolean(pending)}
              >
                {sessionsUserId === item._id ? 'Ẩn phiên' : 'Phiên'}
              </button>
              {item.loginLockedAt ? (
                <button
                  type="button"
                  onClick={() =>
                    run(
                      `unlock-login-${item._id}`,
                      () => unlockLogin({ userId: item._id }),
                      'Đã mở khóa đăng nhập.',
                    )
                  }
                  disabled={Boolean(pending)}
                >
                  Mở khóa ĐN
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  run(
                    `status-${item._id}`,
                    () => setDisabled({ id: item._id, disabled: item.status === 'active' }),
                    item.status === 'active' ? 'Đã khóa tài khoản.' : 'Đã mở lại tài khoản.',
                  )
                }
                disabled={Boolean(pending)}
              >
                {item.status === 'active' ? 'Khóa' : 'Mở khóa'}
              </button>
              <button type="button" className="danger-button" onClick={() => confirmDelete(item)} disabled={Boolean(pending)}>
                Xóa
              </button>
            </div>
            {sessionsUserId === item._id ? (
              <div className="admin-sessions-drawer">
                <DevicesPanel mode="admin" userId={item._id} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function AssignUserPanel({ users, filterId, idField, onAssign, onUnassign, pending, label }) {
  const [userId, setUserId] = useState('');
  const members = users.filter((u) => u[idField] === filterId);
  const candidates = users.filter((u) => u.status === 'active' && u[idField] !== filterId);
  return (
    <div className="assign-panel">
      <div className="assign-row">
        <select value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Chọn người dùng…</option>
          {candidates.map((u) => (
            <option key={u._id} value={u._id}>
              {u.name || u.email} ({u.email})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="primary-button small-btn"
          disabled={!userId || Boolean(pending)}
          onClick={async () => {
            if (!userId) return;
            await onAssign(userId);
            setUserId('');
          }}
        >
          + Thêm user vào {label}
        </button>
      </div>
      {members.length === 0 ? (
        <p className="muted">Chưa có user trong mục này.</p>
      ) : (
        <ul className="member-list">
          {members.map((u) => (
            <li key={u._id}>
              <span>
                <strong>{u.name || '—'}</strong> · {u.email}
              </span>
              <button type="button" className="text-button" disabled={Boolean(pending)} onClick={() => onUnassign(u._id)}>
                Gỡ
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DepartmentManagement() {
  const data = useQuery(anyApi.departments.list);
  const create = useMutation(anyApi.departments.create);
  const update = useMutation(anyApi.departments.update);
  const remove = useMutation(anyApi.departments.remove);
  const assignUser = useMutation(anyApi.departments.assignUser);
  const unassignUser = useMutation(anyApi.departments.unassignUser);
  const [form, setForm] = useState({ name: '', code: '' });
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const { pending, feedback, run } = useFeedback();

  const departments = (data?.departments || []).filter((d) => d.active);
  const users = data?.users || [];

  const submit = async (event) => {
    event.preventDefault();
    if (editing) {
      const ok = await run('save', () => update({ id: editing._id, name: form.name, code: form.code }), 'Đã cập nhật phòng ban.');
      if (ok) {
        setEditing(null);
        setForm({ name: '', code: '' });
      }
    } else {
      const ok = await run('save', () => create({ name: form.name, code: form.code }), 'Đã thêm phòng ban. Có thể thêm user bên dưới.');
      if (ok) setForm({ name: '', code: '' });
    }
  };

  if (data === undefined) return <LoadingView label="Đang tải phòng ban…" />;

  return (
    <section className="admin-view modern-management departments-management">
      <div className="section-intro">
        <div>
          <span className="status-pill blue">Phòng ban</span>
          <h2>Thiết lập phòng ban</h2>
          <p>Thêm, sửa, xóa phòng ban. Sau khi tạo có thể gán user vào phòng ban.</p>
        </div>
      </div>
      <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
        {feedback.text}
      </div>
      <form className="admin-form" onSubmit={submit}>
        <div className="form-heading">
          <strong>{editing ? `Sửa: ${editing.name}` : 'Thêm phòng ban'}</strong>
          {editing && (
            <button type="button" className="text-button" onClick={() => { setEditing(null); setForm({ name: '', code: '' }); }}>
              Hủy
            </button>
          )}
        </div>
        <label>
          Tên phòng ban
          <input required maxLength={120} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label>
          Mã
          <input required maxLength={20} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
        </label>
        <button className="primary-button" disabled={Boolean(pending)}>
          {editing ? 'Lưu' : '+ Thêm phòng ban'}
        </button>
      </form>
      <div className="card-list">
        {departments.map((item) => (
          <article className="mgmt-card" key={item._id}>
            <div className="mgmt-card-head">
              <div>
                <strong>{item.name}</strong>
                <span className="code-tag">{item.code}</span>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(item);
                    setForm({ name: item.name, code: item.code });
                  }}
                  disabled={Boolean(pending)}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    if (window.confirm(`Xóa phòng ban ${item.name}? Chỉ xóa được khi không còn user đang gán.`)) {
                      void run(`del-${item._id}`, () => remove({ id: item._id }), 'Đã xóa phòng ban.');
                    }
                  }}
                  disabled={Boolean(pending)}
                >
                  Xóa
                </button>
                <button type="button" onClick={() => setExpanded(expanded === item._id ? null : item._id)}>
                  {expanded === item._id ? 'Ẩn user' : 'Thêm user'}
                </button>
              </div>
            </div>
            {expanded === item._id && (
              <AssignUserPanel
                users={users}
                filterId={item._id}
                idField="departmentId"
                label="phòng ban"
                pending={pending}
                onAssign={(userId) => run('assign', () => assignUser({ departmentId: item._id, userId }), 'Đã gán user vào phòng ban.')}
                onUnassign={(userId) => run('unassign', () => unassignUser({ userId }), 'Đã gỡ user khỏi phòng ban.')}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function LocationManagement() {
  const data = useQuery(anyApi.locations.list);
  const create = useMutation(anyApi.locations.create);
  const update = useMutation(anyApi.locations.update);
  const remove = useMutation(anyApi.locations.remove);
  const [form, setForm] = useState({ name: '', description: '' });
  const [editing, setEditing] = useState(null);
  const { pending, feedback, run } = useFeedback();

  const locations = (data?.locations || []).filter((item) => item.active);

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      name: form.name,
      description: form.description.trim() ? form.description : undefined,
    };
    if (editing) {
      const ok = await run('save', () => update({ id: editing._id, ...payload }), 'Đã cập nhật địa điểm.');
      if (ok) {
        setEditing(null);
        setForm({ name: '', description: '' });
      }
    } else {
      const ok = await run('save', () => create(payload), 'Đã thêm địa điểm.');
      if (ok) setForm({ name: '', description: '' });
    }
  };

  if (data === undefined) return <LoadingView label="Đang tải địa điểm…" />;

  return (
    <section className="admin-view modern-management locations-management">
      <div className="section-intro">
        <div>
          <span className="status-pill blue">Địa điểm</span>
          <h2>Thiết lập địa điểm</h2>
          <p>Thêm, sửa, xóa địa điểm dùng trong các nghiệp vụ nhà trường.</p>
        </div>
      </div>
      <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
        {feedback.text}
      </div>
      <form className="admin-form" onSubmit={submit}>
        <div className="form-heading">
          <strong>{editing ? `Sửa: ${editing.name}` : 'Thêm địa điểm'}</strong>
          {editing && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditing(null);
                setForm({ name: '', description: '' });
              }}
            >
              Hủy
            </button>
          )}
        </div>
        <label>
          Tên địa điểm
          <input required maxLength={120} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label>
          Mô tả
          <textarea
            maxLength={1000}
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Mô tả ngắn về địa điểm (tùy chọn)"
          />
        </label>
        <button className="primary-button" disabled={Boolean(pending)}>
          {editing ? 'Lưu' : '+ Thêm địa điểm'}
        </button>
      </form>
      <div className="card-list">
        {locations.length === 0 ? (
          <p className="muted">Chưa có địa điểm nào. Thêm địa điểm đầu tiên ở form trên.</p>
        ) : (
          locations.map((item) => (
            <article className="mgmt-card" key={item._id}>
              <div className="mgmt-card-head">
                <div>
                  <strong>{item.name}</strong>
                  {item.description ? <span className="muted-block">{item.description}</span> : <span className="muted-block">Không có mô tả</span>}
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(item);
                      setForm({ name: item.name, description: item.description || '' });
                    }}
                    disabled={Boolean(pending)}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      if (window.confirm(`Xóa địa điểm ${item.name}?`)) {
                        void run(`del-${item._id}`, () => remove({ id: item._id }), 'Đã xóa địa điểm.');
                      }
                    }}
                    disabled={Boolean(pending)}
                  >
                    Xóa
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function defaultAccessForm() {
  return Object.fromEntries(PRIMARY_MENUS.map(([id]) => [id, id === 'notifications' ? 'view' : 'hidden']));
}

function PermissionGroupManagement() {
  const data = useQuery(anyApi.permissionGroups.list);
  const create = useMutation(anyApi.permissionGroups.create);
  const update = useMutation(anyApi.permissionGroups.update);
  const remove = useMutation(anyApi.permissionGroups.remove);
  const assignUser = useMutation(anyApi.permissionGroups.assignUser);
  const unassignUser = useMutation(anyApi.permissionGroups.unassignUser);
  const ensureCodes = useMutation(anyApi.permissionGroups.ensureCodes);
  const [form, setForm] = useState({ name: '', code: '', description: '', access: defaultAccessForm() });
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [codesReady, setCodesReady] = useState(false);
  const { pending, feedback, run } = useFeedback();

  const groups = (data?.groups || []).filter((g) => g.active);
  const menus = data?.menus || PRIMARY_MENUS.map(([id, label]) => ({ id, label }));
  const users = data?.users || [];

  useEffect(() => {
    if (!data || codesReady) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureCodes({});
      } catch {
        // Non-blocking: import validation will still catch missing/invalid codes.
      } finally {
        if (!cancelled) setCodesReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, codesReady, ensureCodes]);

  const toMenuAccess = (accessMap) => menus.map((m) => ({ menu: m.id, access: accessMap[m.id] || 'hidden' }));

  const emptyForm = () => ({ name: '', code: '', description: '', access: defaultAccessForm() });

  const startEdit = (item) => {
    setEditing(item);
    const access = defaultAccessForm();
    for (const entry of item.menuAccess || []) {
      access[entry.menu] = entry.access === 'edit' ? 'view' : entry.access;
    }
    setForm({ name: item.name, code: item.code || '', description: item.description || '', access });
  };

  const submit = async (event) => {
    event.preventDefault();
    const menuAccess = toMenuAccess(form.access);
    if (editing) {
      const ok = await run(
        'save',
        () =>
          update({
            id: editing._id,
            name: form.name.trim(),
            code: form.code.trim(),
            description: form.description.trim() ? form.description.trim() : undefined,
            menuAccess,
          }),
        'Đã cập nhật nhóm quyền.',
      );
      if (ok) {
        setEditing(null);
        setForm(emptyForm());
      }
    } else {
      const ok = await run(
        'save',
        () =>
          create({
            name: form.name.trim(),
            code: form.code.trim(),
            description: form.description.trim() ? form.description.trim() : undefined,
            menuAccess,
          }),
        'Đã tạo nhóm quyền. Có thể thêm user bên dưới.',
      );
      if (ok) setForm(emptyForm());
    }
  };

  if (data === undefined) return <LoadingView label="Đang tải nhóm quyền…" />;

  return (
    <section className="admin-view modern-management permission-groups-management">
      <div className="section-intro">
        <div>
          <span className="status-pill blue">Nhóm quyền</span>
          <h2>Thiết lập nhóm quyền</h2>
          <p>
            Mỗi nhóm quy định quyền trên menu Quản trị hệ thống: Ẩn, Xem (thao tác nghiệp vụ trong phạm vi của mình), Xem tối cao (thao tác nghiệp vụ trên phạm vi toàn trường), hoặc Giám thị.
            Giám thị chỉ dành cho menu Điểm danh (menu này chỉ có Ẩn hoặc Giám thị); các menu khác không thể chọn mức Giám thị.
            Mã nhóm quyền (tối đa 20 ký tự) dùng khi import user hàng loạt.
          </p>
        </div>
      </div>
      <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
        {feedback.text}
      </div>
      <form className="admin-form wide-form" onSubmit={submit}>
        <div className="form-heading">
          <strong>{editing ? `Sửa: ${editing.name}` : 'Thêm nhóm quyền'}</strong>
          {editing && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditing(null);
                setForm(emptyForm());
              }}
            >
              Hủy
            </button>
          )}
        </div>
        <label>
          Tên nhóm quyền
          <input required maxLength={120} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <div className="permission-code-field">
          <div className="field-label-row">
            <label htmlFor="permission-group-code">Mã nhóm quyền</label>
            <button
              type="button"
              className="field-help-trigger"
              aria-label="Quy tắc mã nhóm quyền"
              title="Chữ in hoa, số, _ hoặc -; tối đa 20 ký tự. Dùng trong file import user."
            >
              !
            </button>
          </div>
          <input
            id="permission-group-code"
            required
            maxLength={20}
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
          />
        </div>
        <label>
          Mô tả (tùy chọn)
          <input maxLength={500} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </label>
        <div className="perm-matrix" role="group" aria-label="Quyền menu">
          <div className="perm-matrix-head">
            <span>Menu</span>
            <span>Ẩn</span>
            <span>Xem</span>
            <span>Xem tối cao</span>
            <span>Giám thị</span>
          </div>
          {menus.map((menu) => (
            <div className="perm-matrix-row" key={menu.id}>
              <span>{menu.label}</span>
              {MATRIX_ACCESS_LEVELS.map((level) => {
                if (!isMatrixLevelAvailable(menu.id, level)) {
                  return (
                    <span key={level} className="radio-cell radio-cell-unavailable" aria-hidden="true">
                      —
                    </span>
                  );
                }
                const current = form.access[menu.id] === 'edit' ? 'view' : form.access[menu.id] || 'hidden';
                return (
                  <label key={level} className="radio-cell">
                    <input
                      type="radio"
                      name={`access-${menu.id}`}
                      checked={current === level}
                      onChange={() => setForm((f) => ({ ...f, access: { ...f.access, [menu.id]: level } }))}
                    />
                    <span className="sr-only">{ACCESS_LABELS[level]}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        <button className="primary-button" disabled={Boolean(pending)}>
          {editing ? 'Lưu nhóm quyền' : '+ Thêm nhóm quyền'}
        </button>
      </form>
      <div className="card-list">
        {groups.map((item) => {
          const accessMap = Object.fromEntries((item.menuAccess || []).map((e) => [e.menu, e.access]));
          return (
            <article className="mgmt-card" key={item._id}>
              <div className="mgmt-card-head">
                <div>
                  <strong>{item.name}</strong>
                  <span className="code-tag">{item.code || 'CHƯA CÓ MÃ'}</span>
                  {item.description && <span className="muted-block">{item.description}</span>}
                </div>
                <div className="row-actions">
                  <button type="button" onClick={() => startEdit(item)} disabled={Boolean(pending)}>
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      if (window.confirm(`Xóa nhóm quyền ${item.name}? Chỉ xóa được khi không còn user đang gán.`)) {
                        void run(`del-${item._id}`, () => remove({ id: item._id }), 'Đã xóa nhóm quyền.');
                      }
                    }}
                    disabled={Boolean(pending)}
                  >
                    Xóa
                  </button>
                  <button type="button" onClick={() => setExpanded(expanded === item._id ? null : item._id)}>
                    {expanded === item._id ? 'Ẩn user' : 'Thêm user'}
                  </button>
                </div>
              </div>
              <div className="perm-summary">
                {menus.map((menu) => (
                  <span key={menu.id} className={`access-chip ${accessMap[menu.id] || 'hidden'}`}>
                    {menu.label}: {ACCESS_LABELS[accessMap[menu.id] || 'hidden']}
                  </span>
                ))}
              </div>
              {expanded === item._id && (
                <AssignUserPanel
                  users={users}
                  filterId={item._id}
                  idField="permissionGroupId"
                  label="nhóm quyền"
                  pending={pending}
                  onAssign={(userId) =>
                    run('assign', () => assignUser({ permissionGroupId: item._id, userId }), 'Đã gán user vào nhóm quyền.')
                  }
                  onUnassign={(userId) => run('unassign', () => unassignUser({ userId }), 'Đã gỡ user khỏi nhóm quyền.')}
                />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function PositionManagement() {
  const data = useQuery(anyApi.positions.list);
  const create = useMutation(anyApi.positions.create);
  const update = useMutation(anyApi.positions.update);
  const remove = useMutation(anyApi.positions.remove);
  const assignUser = useMutation(anyApi.positions.assignUser);
  const unassignUser = useMutation(anyApi.positions.unassignUser);
  const [form, setForm] = useState({ name: '', code: '', level: 3 });
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const { pending, feedback, run } = useFeedback();

  const positions = (data?.positions || []).filter((p) => p.active);
  const users = data?.users || [];

  const submit = async (event) => {
    event.preventDefault();
    const level = Number(form.level);
    if (editing) {
      const ok = await run(
        'save',
        () => update({ id: editing._id, name: form.name, code: form.code, level }),
        'Đã cập nhật chức vụ.',
      );
      if (ok) {
        setEditing(null);
        setForm({ name: '', code: '', level: 3 });
      }
    } else {
      const ok = await run('save', () => create({ name: form.name, code: form.code, level }), 'Đã tạo chức vụ. Có thể thêm user bên dưới.');
      if (ok) setForm({ name: '', code: '', level: 3 });
    }
  };

  if (data === undefined) return <LoadingView label="Đang tải chức vụ…" />;

  return (
    <section className="admin-view modern-management positions-management">
      <div className="section-intro">
        <div>
          <span className="status-pill blue">Chức vụ</span>
          <h2>Thiết lập chức vụ</h2>
          <p>
            Cấp bậc 1–5 sao quyết định quy trình duyệt: cấp cao hơn duyệt được cấp thấp hơn; có thể duyệt thay cấp thấp hơn (ghi log người duyệt và thời điểm).
          </p>
        </div>
      </div>
      <div className={`feedback ${feedback.type}`} role="status" aria-live="polite">
        {feedback.text}
      </div>
      <div className="notice approval-note">
        <strong>Quy tắc duyệt:</strong>
        <span>Người có cấp sao cao hơn sẽ được phép duyệt người có cấp sao thấp hơn.</span>
        <span>Ví dụ: 5 sao duyệt cho 4 sao trở xuống, 4 sao duyệt cho 3 sao trở xuống… 1 sao không thể duyệt cho ai.</span>
      </div>
      <form className="admin-form" onSubmit={submit}>
        <div className="form-heading">
          <strong>{editing ? `Sửa: ${editing.name}` : 'Thêm chức vụ'}</strong>
          {editing && (
            <button type="button" className="text-button" onClick={() => { setEditing(null); setForm({ name: '', code: '', level: 3 }); }}>
              Hủy
            </button>
          )}
        </div>
        <label>
          Tên chức vụ
          <input required maxLength={120} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </label>
        <label>
          Mã
          <input required maxLength={20} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
        </label>
        <label>
          Cấp bậc (1–5 sao)
          <select value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} sao {n === 5 ? '(cao nhất)' : n === 1 ? '(thấp nhất)' : ''}
              </option>
            ))}
          </select>
          <StarRating level={form.level} />
        </label>
        <button className="primary-button" disabled={Boolean(pending)}>
          {editing ? 'Lưu chức vụ' : '+ Thêm chức vụ'}
        </button>
      </form>
      <div className="card-list">
        {positions.map((item) => (
          <article className="mgmt-card" key={item._id}>
            <div className="mgmt-card-head">
              <div>
                <strong>{item.name}</strong>
                <span className="code-tag">{item.code}</span>
                <div className="star-row">
                  <StarRating level={item.level} />
                  <span className="muted">Cấp {item.level}/5</span>
                </div>
              </div>
              <div className="row-actions">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(item);
                    setForm({ name: item.name, code: item.code, level: item.level });
                  }}
                  disabled={Boolean(pending)}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    if (window.confirm(`Xóa chức vụ ${item.name}? Chỉ xóa được khi không còn user đang gán.`)) {
                      void run(`del-${item._id}`, () => remove({ id: item._id }), 'Đã xóa chức vụ.');
                    }
                  }}
                  disabled={Boolean(pending)}
                >
                  Xóa
                </button>
                <button type="button" onClick={() => setExpanded(expanded === item._id ? null : item._id)}>
                  {expanded === item._id ? 'Ẩn user' : 'Thêm user'}
                </button>
              </div>
            </div>
            {expanded === item._id && (
              <AssignUserPanel
                users={users}
                filterId={item._id}
                idField="positionId"
                label="chức vụ"
                pending={pending}
                onAssign={(userId) => run('assign', () => assignUser({ positionId: item._id, userId }), 'Đã gán user vào chức vụ.')}
                onUnassign={(userId) => run('unassign', () => unassignUser({ userId }), 'Đã gỡ user khỏi chức vụ.')}
              />
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function MustChangePasswordView() {
  const changeOwnPassword = useAction(anyApi.users.changeOwnPassword);
  const { signOut } = useAuthActions();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setFeedback('');
    if (password.length < 8) return setFeedback('Mật khẩu mới phải có ít nhất 8 ký tự.');
    if (password !== confirmation) return setFeedback('Xác nhận mật khẩu không khớp.');
    setPending(true);
    try {
      await changeOwnPassword({ newPassword: password });
      setFeedback('Đã đổi mật khẩu. Đang mở không gian làm việc…');
      setPassword('');
      setConfirmation('');
    } catch (error) {
      setFeedback(messageFor(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="placeholder-view">
      <span className="placeholder-icon">!</span>
      <span className="status-pill blue">Bảo mật tài khoản</span>
      <h2>Đổi mật khẩu trước khi tiếp tục</h2>
      <p>Đây là lần đăng nhập đầu tiên hoặc mật khẩu vừa được quản trị viên đặt lại. Đổi mật khẩu của chính bạn để vào ứng dụng.</p>
      <form className="password-form" onSubmit={submit}>
        <label>
          Mật khẩu mới
          <input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Xác nhận mật khẩu
          <input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </label>
        <p className="form-message" role="status" aria-live="polite">
          {feedback}
        </p>
        <button className="primary-button" disabled={pending}>
          {pending ? 'Đang cập nhật…' : 'Đổi mật khẩu và tiếp tục'}
        </button>
        <button type="button" className="text-button" onClick={() => void signOut()} disabled={pending}>
          Đăng xuất
        </button>
      </form>
    </section>
  );
}

function PlaceholderView({ title, access, isAdmin }) {
  const accessLabel = isAdmin
    ? 'Quản trị'
    : access === 'view_all'
      ? 'Xem tối cao'
      : 'Xem';
  return (
    <section className="placeholder-view">
      <span className="placeholder-icon">⌁</span>
      <span className="status-pill blue">{accessLabel}</span>
      <h2>{title}</h2>
      <p>
        Nội dung nghiệp vụ đang được hoàn thiện.
        {!isAdmin && access === 'view_all'
          ? ' Bạn có thể xem và thao tác dữ liệu của mọi user khi module sẵn sàng.'
          : !isAdmin
            ? ' Bạn có thể xem và thao tác nghiệp vụ trong phạm vi của mình khi module sẵn sàng.'
            : ''}
      </p>
    </section>
  );
}

function AccessDeniedView({ message }) {
  const { signOut } = useAuthActions();
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">CRM Lê Văn Tám</p>
        <h1>Chưa thể truy cập</h1>
        <p>{message}</p>
        <button type="button" className="text-button" onClick={() => void signOut()}>
          Đăng xuất
        </button>
      </div>
    </main>
  );
}

function SignedOutView() {
  const { signIn } = useAuthActions();
  const requestPasswordReset = useAction(anyApi.users.requestPasswordReset);
  const [mode, setMode] = useState('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submitSignIn = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');
    setPending(true);
    try {
      await signIn('password', { email: email.trim().toLowerCase(), password, flow: 'signIn' });
    } catch (err) {
      setError(signInMessageFor(err));
    } finally {
      setPending(false);
    }
  };

  const submitForgot = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');
    setPending(true);
    try {
      await requestPasswordReset({ email: email.trim().toLowerCase() });
      setInfo(
        'Nếu email tồn tại trong hệ thống, mật khẩu tạm đã được gửi. Hãy kiểm tra hộp thư rồi đăng nhập và đổi mật khẩu mới.',
      );
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setPending(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setInfo('');
    setPassword('');
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <img src="/assets/logo-thcs-le-van-tam.png" alt="Logo Trường THCS Lê Văn Tám" />
        <p className="eyebrow">CRM Lê Văn Tám</p>
        {mode === 'signIn' ? (
          <>
            <h1>Đăng nhập không gian nội bộ</h1>
            <p>Đăng nhập bằng email và mật khẩu do nhà trường cấp. Không có đăng ký công khai.</p>
            <form className="password-form sign-in-form" onSubmit={submitSignIn}>
              <label>
                Email
                <input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                Mật khẩu
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label className="auth-show-password">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                />
                Hiện mật khẩu
              </label>
              <p className={`form-message${info ? ' form-message-success' : ''}`} role="status" aria-live="polite">
                {error || info}
              </p>
              <button className="primary-button" disabled={pending}>
                {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
              </button>
              <button type="button" className="text-button auth-forgot-link" disabled={pending} onClick={() => switchMode('forgot')}>
                Quên mật khẩu?
              </button>
              <a className="text-button auth-forgot-link" href="/privacy">
                Chính sách bảo mật / Privacy policy
              </a>
            </form>
          </>
        ) : (
          <>
            <h1>Quên mật khẩu</h1>
            <p>Nhập email tài khoản. Nếu email có trong hệ thống, chúng tôi sẽ gửi mật khẩu tạm tới hộp thư của bạn.</p>
            <form className="password-form sign-in-form" onSubmit={submitForgot}>
              <label>
                Email
                <input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <p className={`form-message${info ? ' form-message-success' : ''}`} role="status" aria-live="polite">
                {error || info}
              </p>
              <button className="primary-button" disabled={pending}>
                {pending ? 'Đang gửi…' : 'Gửi mật khẩu tạm'}
              </button>
              <button type="button" className="text-button auth-forgot-link" disabled={pending} onClick={() => switchMode('signIn')}>
                Quay lại đăng nhập
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

function MissingKeyView() {
  return (
    <main className="auth-page">
      <div className="auth-card setup-card">
        <img src="/assets/logo-thcs-le-van-tam.png" alt="Logo Trường THCS Lê Văn Tám" />
        <p className="eyebrow">CRM Lê Văn Tám</p>
        <h1>Cần cấu hình hệ thống</h1>
        <p>Hệ thống chưa được cấu hình để xác thực người dùng. Vui lòng liên hệ quản trị viên để được hỗ trợ.</p>
      </div>
    </main>
  );
}

function Root() {
  if (isPublicPrivacyPath(window.location.pathname)) {
    return <PrivacyPolicyPage />;
  }
  if (isPublicAccountDeletionPath(window.location.pathname)) {
    return <AccountDeletionPage />;
  }
  if (!convex) return <MissingKeyView />;
  return (
    <ConvexAuthProvider client={convex}>
      <AuthLoading>
        <LoadingView label="Đang kiểm tra phiên đăng nhập…" />
      </AuthLoading>
      <Unauthenticated>
        <SignedOutView />
      </Unauthenticated>
      <Authenticated>
        <AuthenticatedApp />
      </Authenticated>
    </ConvexAuthProvider>
  );
}

function LoadingView({ label }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">CRM Lê Văn Tám</p>
        <h1>{label}</h1>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
