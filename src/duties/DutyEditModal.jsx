import { Component, useEffect, useId, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import { messageFor } from '../lib/appErrorMessage';
import CollapsibleMultiCheckList from '../lib/CollapsibleMultiCheckList.jsx';
import ConfirmActionModal, { EditActionConfirm } from '../lib/ConfirmActionModal';
import DutyChangeHistory from './DutyChangeHistory';
import { canDeleteDutyFromEditor, dutyEditModeFor } from './sharedDutySchedule.js';
import DutyEditorFields from './DutyEditorFields';
import {
  applyDutyEndDateTime,
  applyDutyFormField,
  applyDutyStartDateTime,
  dutyFormFromItem,
  dutyFormHasParticipants,
  dutyPayloadFromForm,
} from './dutyDisplay';

export { dutyEditModeFor };

/**
 * `mode="reviewer"`: BGH edits the working copy of a school duty through
 * `duties.reviewerUpdate` (live at once, no re-approval, logged). The form
 * starts from the server's working copy, not the teacher-facing projection.
 */
class DutyEditBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="duty-edit-scope">
        <div className="duty-edit-backdrop" role="presentation" onClick={this.props.onClose}>
          <div className="duty-edit-modal" role="alertdialog" aria-modal="true" aria-label="Không mở được biểu mẫu" onClick={(event) => event.stopPropagation()}>
            <div className="duty-edit-modal-body">
              <p className="work-feedback error" role="alert">{messageFor(this.state.error)}</p>
            </div>
            <div className="work-editor-actions duty-editor-actions duty-edit-modal-footer">
              <button type="button" className="work-primary-button" onClick={this.props.onClose}>Đóng</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default function DutyEditModal(props) {
  return (
    <DutyEditBoundary onClose={props.onClose}>
      <DutyEditModalBody {...props} />
    </DutyEditBoundary>
  );
}

function DutyEditModalBody({ duty, onClose, onSaved = null, mode = 'manager' }) {
  const titleId = useId();
  const isReviewer = mode === 'reviewer';
  const managerOptions = useQuery(anyApi.duties.formOptions, isReviewer ? 'skip' : {});
  const reviewerContext = useQuery(anyApi.duties.reviewerEditContext, isReviewer && duty?._id ? { id: duty._id } : 'skip');
  const options = isReviewer ? reviewerContext : managerOptions;
  const update = useMutation(anyApi.duties.update);
  const reviewerUpdate = useMutation(anyApi.duties.reviewerUpdate);
  const removeDuty = useMutation(anyApi.duties.remove);
  const canDelete = canDeleteDutyFromEditor(duty, mode);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [form, setForm] = useState(() => dutyFormFromItem(duty));
  const [pending, setPending] = useState('');
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [editConfirm, setEditConfirm] = useState(null);
  const includeDepartments = isReviewer || Boolean(options?.isOps);

  useEffect(() => {
    setForm(dutyFormFromItem(duty));
    setFeedback({ type: '', text: '' });
    setEditConfirm(null);
    setDeleteConfirm(false);
  }, [duty?._id]);

  const reviewerSourceId = reviewerContext?.duty?._id;
  useEffect(() => {
    if (!isReviewer || !reviewerContext?.duty) return;
    setForm(dutyFormFromItem(reviewerContext.duty));
  }, [isReviewer, reviewerSourceId]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape' || pending || editConfirm || deleteConfirm) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending, editConfirm, deleteConfirm]);

  const setField = (field, value) => {
    setForm((prev) => applyDutyFormField(prev, field, value));
  };

  const persistDuty = async () => {
    if (pending === 'save' || !duty?._id) return;
    const payload = dutyPayloadFromForm(form, { includeDepartments });
    if (!includeDepartments && !dutyFormHasParticipants(form, { includeDepartments })) {
      setFeedback({ type: 'error', text: 'Vui lòng chọn phòng ban, cá nhân tham gia, hoặc điền thành phần khác.' });
      return;
    }
    setPending('save');
    setFeedback({ type: '', text: '' });
    try {
      await (isReviewer ? reviewerUpdate : update)({ id: duty._id, ...payload });
      onSaved?.();
      onClose();
    } catch (error) {
      console.error('Duty inline update failed', error);
      setFeedback({ type: 'error', text: messageFor(error) });
    } finally {
      setPending('');
    }
  };

  const deleteDuty = async () => {
    if (pending || !duty?._id || !canDelete) return;
    setPending('delete');
    setFeedback({ type: '', text: '' });
    try {
      await removeDuty({ id: duty._id });
      setDeleteConfirm(false);
      onSaved?.();
      onClose();
    } catch (error) {
      console.error('Duty delete failed', error);
      setDeleteConfirm(false);
      setFeedback({ type: 'error', text: messageFor(error) });
    } finally {
      setPending('');
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (!includeDepartments && !dutyFormHasParticipants(form, { includeDepartments })) {
      setFeedback({ type: 'error', text: 'Vui lòng chọn phòng ban, cá nhân tham gia, hoặc điền thành phần khác.' });
      return;
    }
    setEditConfirm('save');
  };

  return (
    <div className="duty-edit-scope">
      <div
        className="duty-edit-backdrop"
        role="presentation"
        onClick={pending ? undefined : onClose}
      >
        <form
          className="duty-edit-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(event) => event.stopPropagation()}
          onSubmit={submit}
        >
          <div className="work-editor-title duty-edit-modal-header">
            <div>
              <span>CẬP NHẬT LỊCH</span>
              <h3 id={titleId}>{isReviewer ? 'Sửa công tác (Ban Giám hiệu)' : 'Sửa công tác'}</h3>
            </div>
            <button type="button" className="duty-editor-close" onClick={onClose} aria-label="Đóng biểu mẫu">
              <span aria-hidden="true">×</span> Đóng
            </button>
          </div>

          <div className="duty-edit-modal-body duty-modern-editor">
            {isReviewer ? (
              <p className="duty-reviewer-note" role="note">
                Thay đổi sẽ áp dụng ngay, không cần duyệt lại và được ghi lịch sử.
              </p>
            ) : null}
            {options === undefined ? (
              <p className="lct-loading">Đang tải biểu mẫu sửa công tác…</p>
            ) : (
              <DutyEditorFields
                form={form}
                onField={setField}
                onStartDateTime={(date, time) => setForm((prev) => applyDutyStartDateTime(prev, date, time))}
                onEndDateTime={(date, time) => setForm((prev) => applyDutyEndDateTime(prev, date, time))}
              >
                {includeDepartments ? (
                  <div className="duty-field">
                    <span className="duty-field-label">Phòng ban tham gia</span>
                    <CollapsibleMultiCheckList
                      title="Chọn phòng ban"
                      options={options.departments}
                      values={form.departmentIds}
                      onChange={(ids) => setField('departmentIds', ids)}
                      getLabel={(department) => `${department.name}${department.code ? ` (${department.code})` : ''}`}
                      searchPlaceholder="Tìm phòng ban…"
                      emptyText="Chưa có phòng ban."
                    />
                  </div>
                ) : null}
                <div className="duty-field">
                  <span className="duty-field-label">{includeDepartments ? 'Cá nhân tham gia' : 'Người tham gia'}</span>
                  <CollapsibleMultiCheckList
                    title={includeDepartments ? 'Chọn cá nhân' : 'Chọn người tham gia'}
                    options={options.users}
                    values={form.participantUserIds}
                    onChange={(ids) => setField('participantUserIds', ids)}
                    getLabel={(user) => `${user.name || '—'} · ${user.email || ''}`}
                    searchPlaceholder="Tìm theo tên, email…"
                    emptyText={includeDepartments ? 'Chưa có người dùng.' : 'Chưa có người tham gia trong phòng ban.'}
                  />
                </div>
              </DutyEditorFields>
            )}

            {feedback.text ? (
              <div className={`work-feedback ${feedback.type}`} role="status" aria-live="polite">
                {feedback.text}
              </div>
            ) : null}
            {duty?.canViewHistory || isReviewer ? <DutyChangeHistory dutyId={duty._id} /> : null}
          </div>

          <div className="work-editor-actions duty-editor-actions duty-edit-modal-footer">
            {canDelete ? (
              <button
                type="button"
                className="work-reject-button duty-edit-delete"
                onClick={() => setDeleteConfirm(true)}
                disabled={Boolean(pending)}
              >
                {pending === 'delete' ? 'Đang xóa…' : 'Xóa'}
              </button>
            ) : null}
            <button type="button" className="work-ghost-button" onClick={() => setEditConfirm('cancel')} disabled={Boolean(pending)}>
              Hủy sửa
            </button>
            <button className="work-primary-button" disabled={Boolean(pending) || options === undefined}>
              {pending === 'save' ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
      {deleteConfirm ? (
        <ConfirmActionModal
          title="Xóa công tác này?"
          description="Công tác sẽ bị gỡ khỏi lịch. Với lịch toàn trường, giáo viên vẫn thấy bản đã duyệt cho tới khi Ban Giám hiệu duyệt lại tuần."
          confirmLabel="Xóa công tác"
          tone="danger"
          pending={pending === 'delete'}
          onCancel={() => setDeleteConfirm(false)}
          onConfirm={() => void deleteDuty()}
        />
      ) : null}
      <EditActionConfirm
        action={editConfirm}
        pending={pending === 'save'}
        onDismiss={() => setEditConfirm(null)}
        onConfirmCancel={onClose}
        onConfirmSave={() => {
          setEditConfirm(null);
          void persistDuty();
        }}
      />
    </div>
  );
}
