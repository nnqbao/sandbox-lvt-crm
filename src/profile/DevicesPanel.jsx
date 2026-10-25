import React, { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { clientKindIcon, formatSessionActiveAt } from './deviceSession';
import { isInApp, postToApp } from '../lib/appBridge';

function localMessageFor(error) {
  const raw = String(error?.data ?? error?.message ?? error ?? '');
  if (raw.includes('CANNOT_REVOKE_CURRENT_SESSION')) return 'Không thể thu hồi phiên đang dùng.';
  if (raw.includes('SESSION_NOT_FOUND')) return 'Phiên đăng nhập không còn tồn tại.';
  if (raw.includes('FORBIDDEN')) return 'Bạn không có quyền thực hiện thao tác này.';
  return 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
}

export default function DevicesPanel({ mode = 'self', userId = null }) {
  const isAdminMode = mode === 'admin' && userId;
  const mine = useQuery(anyApi.sessions.listMine, isAdminMode ? 'skip' : {});
  const forUser = useQuery(
    anyApi.sessions.listForUser,
    isAdminMode ? { userId } : 'skip',
  );
  const sessions = isAdminMode ? forUser : mine;
  const revokeMine = useAction(anyApi.sessions.revokeMine);
  const revokeAllOthers = useAction(anyApi.sessions.revokeAllOthers);
  const revokeForUser = useAction(anyApi.sessions.revokeForUser);
  const revokeAllForUser = useAction(anyApi.sessions.revokeAllForUser);
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState('');
  const [now] = useState(() => Date.now());

  if (sessions === undefined) {
    return <div className="devices-panel devices-loading">Đang tải phiên đăng nhập…</div>;
  }

  const current = sessions.find((s) => s.isCurrent) || null;
  const others = sessions.filter((s) => !s.isCurrent);

  const run = async (key, fn, okText) => {
    setFeedback('');
    setPending(key);
    try {
      await fn();
      setFeedback(okText);
    } catch (error) {
      setFeedback(localMessageFor(error));
    } finally {
      setPending('');
    }
  };

  return (
    <div className={`devices-panel ${isAdminMode ? 'devices-admin' : ''}`}>
      <header className="devices-head">
        <div>
          <span className="profile-eyebrow">THIẾT BỊ</span>
          <h3>{isAdminMode ? 'Phiên đăng nhập của người dùng' : 'Thiết bị đã đăng nhập'}</h3>
          <p>Quản lý phiên giống danh sách thiết bị — thu hồi sẽ đăng xuất và ngừng nhận thông báo trên thiết bị đó.</p>
        </div>
      </header>

      {feedback ? (
        <p className={`profile-feedback ${feedback.startsWith('Đã') ? 'success' : 'error'}`} role="status">
          {feedback}
        </p>
      ) : null}

      {current ? (
        <section className="devices-section">
          <h4>THIẾT BỊ NÀY</h4>
          <SessionRow session={current} now={now} />
          {others.length > 0 && !isAdminMode ? (
            <button
              type="button"
              className="devices-logout-others"
              disabled={Boolean(pending)}
              onClick={() =>
                run(
                  'others',
                  () => revokeAllOthers({}),
                  'Đã đăng xuất tất cả phiên khác.',
                )
              }
            >
              <span aria-hidden="true">✋</span>
              <span>
                <strong>Đăng xuất tất cả phiên khác</strong>
                <small>Đăng xuất khỏi tất cả trừ thiết bị này.</small>
              </span>
            </button>
          ) : null}
        </section>
      ) : null}

      <section className="devices-section">
        <h4>PHIÊN ĐĂNG NHẬP</h4>
        {others.length === 0 ? (
          <p className="devices-empty">Không có phiên đăng nhập nào khác.</p>
        ) : (
          <ul className="devices-list">
            {others.map((session) => (
              <li key={session.sessionId}>
                <SessionRow session={session} now={now} />
                <button
                  type="button"
                  className="text-button devices-revoke"
                  disabled={Boolean(pending)}
                  onClick={() =>
                    run(
                      session.sessionId,
                      () =>
                        isAdminMode
                          ? revokeForUser({ userId, sessionId: session.sessionId })
                          : revokeMine({ sessionId: session.sessionId }),
                      'Đã thu hồi phiên đăng nhập.',
                    )
                  }
                >
                  {pending === session.sessionId ? '…' : 'Thu hồi'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!isAdminMode ? <SignInKeysSection now={now} /> : null}

      {isAdminMode && sessions.length > 0 ? (
        <button
          type="button"
          className="danger-button devices-admin-revoke-all"
          disabled={Boolean(pending)}
          onClick={() => {
            if (!window.confirm('Thu hồi tất cả phiên đăng nhập của người dùng này?')) return;
            void run('all', () => revokeAllForUser({ userId }), 'Đã thu hồi toàn bộ phiên.');
          }}
        >
          Thu hồi tất cả phiên
        </button>
      ) : null}
    </div>
  );
}

function SessionRow({ session, now }) {
  return (
    <div className="devices-row">
      <span className="devices-icon" aria-hidden="true">
        {clientKindIcon(session.clientKind)}
      </span>
      <div className="devices-meta">
        <strong>{session.deviceName}</strong>
        <span>{session.platformLabel}</span>
        <small>
          {session.isCurrent ? 'Thiết bị này' : formatSessionActiveAt(session.lastActiveAt, now)}
        </small>
      </div>
    </div>
  );
}

const KEY_KIND_LABELS = { device_key: 'Vân tay / Face ID', passkey: 'Passkey' };
const PLATFORM_LABELS = { ios: 'iPhone / iPad', android: 'Android' };

/** Vân tay / Face ID và passkey bật trên app. Gỡ ở đây khi mất máy hoặc đổi máy. */
function SignInKeysSection({ now }) {
  const keys = useQuery(anyApi.deviceAuth.listMine, {});
  const remove = useMutation(anyApi.deviceAuth.removeMine);
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState('');
  if (keys === undefined) return null;
  return (
    <section className="devices-section">
      <h4>VÂN TAY, FACE ID VÀ PASSKEY</h4>
      {isInApp() ? (
        <button type="button" className="primary-button devices-quick-sign-in" onClick={() => postToApp({ type: 'quick-sign-in' })}>
          Cài đặt đăng nhập nhanh trên điện thoại này
        </button>
      ) : null}
      {feedback ? <p className="profile-feedback" role="status">{feedback}</p> : null}
      {keys.length === 0 ? (
        <p className="devices-empty">Chưa bật đăng nhập bằng vân tay, Face ID hay passkey trên app nào.</p>
      ) : (
        <ul className="devices-list">
          {keys.map((key) => (
            <li key={key._id}>
              <div className="devices-row">
                <span className="devices-icon" aria-hidden="true">{key.kind === 'passkey' ? '🔑' : '👆'}</span>
                <div className="devices-meta">
                  <strong>{key.deviceName}</strong>
                  <span>{KEY_KIND_LABELS[key.kind] || key.kind} · {PLATFORM_LABELS[key.platform] || key.platform}</span>
                  <small>{key.lastUsedAt ? formatSessionActiveAt(key.lastUsedAt, now) : 'Chưa dùng để đăng nhập'}</small>
                </div>
              </div>
              <button
                type="button"
                className="text-button devices-revoke"
                disabled={Boolean(pending)}
                onClick={async () => {
                  if (!window.confirm(`Gỡ ${KEY_KIND_LABELS[key.kind] || 'cách đăng nhập'} trên ${key.deviceName}? Máy đó sẽ phải đăng nhập bằng mật khẩu.`)) return;
                  setPending(key._id);
                  setFeedback('');
                  try {
                    await remove({ id: key._id });
                    setFeedback('Đã gỡ.');
                  } catch (error) {
                    setFeedback(localMessageFor(error));
                  } finally {
                    setPending('');
                  }
                }}
              >
                {pending === key._id ? '…' : 'Gỡ'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
