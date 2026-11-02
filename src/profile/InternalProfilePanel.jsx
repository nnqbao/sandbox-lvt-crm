import React, { useRef, useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { anyApi } from 'convex/server';
import { AVATAR_ACCEPT, isAllowedAvatarFile } from '../lib/prepareAvatarFile.js';
import { avatarSessionFromCommit } from '../lib/profileAvatar.js';
import { messageFor } from '../lib/appErrorMessage.js';
import StarRating from '../lib/StarRating.jsx';
import AvatarCropModal from './AvatarCropModal.jsx';
import { useOwnAvatarContext } from './useOwnAvatar.jsx';

const ROLE_LABELS = { admin: 'Administrator', moderator: 'Moderator', user: 'User' };

function FieldGlyph({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function NameFieldIcon() {
  return (
    <FieldGlyph>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.5c1.2-3.6 3.5-5.3 7-5.3s5.8 1.7 7 5.3" />
    </FieldGlyph>
  );
}

function EmailFieldIcon() {
  return (
    <FieldGlyph>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m3.8 7.2 8.2 6.2 8.2-6.2" />
    </FieldGlyph>
  );
}

function RoleFieldIcon() {
  return (
    <FieldGlyph>
      <path d="M12 3.5 19.5 7v5.2c0 4.4-3.1 7.4-7.5 8.8-4.4-1.4-7.5-4.4-7.5-8.8V7z" />
      <path d="m9.2 12.2 1.9 1.9 3.7-3.8" />
    </FieldGlyph>
  );
}

function DepartmentFieldIcon() {
  return (
    <FieldGlyph>
      <path d="M4.5 20.5V8.4L12 4.5l7.5 3.9v12.1z" />
      <path d="M9.4 20.5v-5.2h5.2v5.2" />
      <path d="M9.5 11h.2M12 11h.2M14.5 11h.2M9.5 14h.2M12 14h.2M14.5 14h.2" />
    </FieldGlyph>
  );
}

function PositionFieldIcon() {
  return (
    <FieldGlyph>
      <rect x="3.5" y="8.5" width="17" height="11.5" rx="2" />
      <path d="M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5" />
    </FieldGlyph>
  );
}

function GroupFieldIcon() {
  return (
    <FieldGlyph>
      <circle cx="9" cy="8" r="2.8" />
      <path d="M3.6 19c1-3.2 2.9-4.7 5.4-4.7s4.4 1.5 5.4 4.7" />
      <circle cx="16.4" cy="8.6" r="2.2" />
      <path d="M15.2 14.4c2.2 0 3.9 1.2 4.8 3.8" />
    </FieldGlyph>
  );
}

export default function InternalProfilePanel({ session }) {
  const generateAvatarUploadUrl = useMutation(anyApi.userAvatar.generateUploadUrl);
  const setOwnAvatar = useAction(anyApi.userAvatar.setOwnAvatar);
  const clearOwnAvatar = useMutation(anyApi.userAvatar.clearOwnAvatar);
  const { user, department, permissionGroup, position, isOperationalManager } = session;
  const {
    avatarUrl,
    hasAvatar,
    initials,
    setAvatarOverlay,
    showAvatarBlob,
  } = useOwnAvatarContext();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState('');
  const [avatarCropFile, setAvatarCropFile] = useState(null);
  const avatarInputRef = useRef(null);

  const displayName = user.name || user.email || 'Chưa đặt tên';
  const roleLabel = ROLE_LABELS[user.role] || user.role;

  const resetAvatarPicker = () => {
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const openAvatarCrop = (file) => {
    setAvatarFeedback('');
    if (!isAllowedAvatarFile(file)) {
      setAvatarFeedback(messageFor(new Error('INVALID_AVATAR_FILE')));
      resetAvatarPicker();
      return;
    }
    setAvatarCropFile(file);
    resetAvatarPicker();
  };

  const cancelAvatarCrop = () => {
    setAvatarCropFile(null);
    resetAvatarPicker();
  };

  const uploadPreparedAvatar = async (prepared) => {
    setAvatarCropFile(null);
    setAvatarFeedback('');
    setAvatarBusy(true);
    try {
      const uploadUrl = await generateAvatarUploadUrl({});
      const uploaded = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': prepared.type || 'image/webp' },
        body: prepared,
      });
      if (!uploaded.ok) throw new Error('AVATAR_UPLOAD_FAILED');
      const { storageId } = await uploaded.json();
      if (!storageId) throw new Error('AVATAR_UPLOAD_FAILED');
      const committed = await setOwnAvatar({ storageId, fileName: prepared.name, fileSize: prepared.size });
      showAvatarBlob(prepared);
      setAvatarOverlay(avatarSessionFromCommit(committed, `local-${Date.now()}`));
      setAvatarFeedback('Đã cập nhật ảnh đại diện.');
    } catch (error) {
      setAvatarFeedback(messageFor(error));
    } finally {
      setAvatarBusy(false);
      resetAvatarPicker();
    }
  };

  const removeAvatar = async () => {
    setAvatarFeedback('');
    setAvatarBusy(true);
    try {
      const committed = await clearOwnAvatar({});
      showAvatarBlob(null);
      setAvatarOverlay(avatarSessionFromCommit(committed));
      setAvatarFeedback('Đã gỡ ảnh đại diện.');
    } catch (error) {
      setAvatarFeedback(messageFor(error));
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <>
      <article className="profile-paper profile-overview">
        <header className="profile-identity">
          <button
            type="button"
            className={`profile-avatar ${avatarUrl ? 'has-photo' : ''}`}
            disabled={avatarBusy}
            onClick={() => avatarInputRef.current?.click()}
            aria-label="Đổi ảnh đại diện"
          >
            {avatarUrl ? <img src={avatarUrl} alt="" /> : (initials || 'LV')}
          </button>
          <input
            ref={avatarInputRef}
            className="profile-avatar-input"
            type="file"
            accept={AVATAR_ACCEPT}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) openAvatarCrop(file);
            }}
          />
          <div>
            <span className="profile-eyebrow">HỒ SƠ NỘI BỘ</span>
            <h3>{displayName}</h3>
            <p>{user.email || 'Chưa có email đăng nhập'}</p>
            <div className="profile-avatar-actions">
              <button type="button" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
                {avatarBusy ? 'Đang cập nhật…' : 'Đổi ảnh đại diện'}
              </button>
              {hasAvatar ? (
                <button type="button" disabled={avatarBusy} onClick={removeAvatar}>
                  Gỡ ảnh
                </button>
              ) : null}
            </div>
            {avatarFeedback ? (
              <p className={`profile-avatar-feedback ${avatarFeedback.startsWith('Đã') ? 'success' : 'error'}`} role="status">
                {avatarFeedback}
              </p>
            ) : null}
          </div>
          <span className={`profile-role profile-role-${user.role}`}>{roleLabel}</span>
        </header>

        <dl className="profile-modern-dl">
          <div>
            <dt><span className="profile-field-icon is-name"><NameFieldIcon /></span> Họ tên</dt>
            <dd>{displayName}</dd>
          </div>
          <div>
            <dt><span className="profile-field-icon is-email"><EmailFieldIcon /></span> Email đăng nhập</dt>
            <dd>{user.email || '—'}</dd>
          </div>
          <div>
            <dt><span className="profile-field-icon is-role"><RoleFieldIcon /></span> Vai trò</dt>
            <dd>{roleLabel}</dd>
          </div>
          <div>
            <dt><span className="profile-field-icon is-department"><DepartmentFieldIcon /></span> Tổ chuyên môn</dt>
            <dd>{department?.name || 'Chưa gán'}</dd>
          </div>
          <div>
            <dt><span className="profile-field-icon is-position"><PositionFieldIcon /></span> Chức vụ</dt>
            <dd>
              {position ? (
                <span className="profile-position">
                  {position.name}
                  <StarRating level={position.level} />
                </span>
              ) : (
                'Chưa gán'
              )}
            </dd>
          </div>
          {!isOperationalManager && (
            <div>
              <dt><span className="profile-field-icon is-group"><GroupFieldIcon /></span> Nhóm quyền</dt>
              <dd>{permissionGroup?.name || 'Chưa gán'}</dd>
            </div>
          )}
        </dl>

        <footer className="profile-help">
          <span aria-hidden="true">?</span>
          <p><strong>Cần hỗ trợ tài khoản?</strong> Liên hệ Administrator để được đặt lại mật khẩu an toàn.</p>
        </footer>
      </article>
      {avatarCropFile ? (
        <AvatarCropModal
          file={avatarCropFile}
          onCancel={cancelAvatarCrop}
          onSave={uploadPreparedAvatar}
        />
      ) : null}
    </>
  );
}
