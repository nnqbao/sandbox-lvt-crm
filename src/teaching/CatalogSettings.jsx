import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { anyApi } from 'convex/server';
import ConfirmActionModal from '../lib/ConfirmActionModal';
import { EmptyState, Feedback, Icon, Loading, useAsyncTask } from '../homeroom/homeroomUi';
import '../homeroom/homeroom.css';
import './teaching.css';

function useCatalog() {
  const ensureDefaults = useMutation(anyApi.teachingCatalog.ensureDefaults);
  const catalog = useQuery(anyApi.teachingCatalog.catalog, {});
  useEffect(() => {
    void ensureDefaults({}).catch(() => {});
  }, [ensureDefaults]);
  return catalog;
}

/** Thiết lập môn học: danh mục môn dùng cho Môn giảng dạy, Lịch dạy và Học bạ. */
export function SubjectSettings() {
  const catalog = useCatalog();
  const create = useMutation(anyApi.teachingCatalog.createSubject);
  const update = useMutation(anyApi.teachingCatalog.updateSubject);
  const remove = useMutation(anyApi.teachingCatalog.removeSubject);
  return (
    <CatalogPage
      eyebrow="Thiết lập tối cao"
      title="Thiết lập môn học"
      description="Môn học dùng khi chọn Môn giảng dạy cho giáo viên, xếp Lịch dạy và nhập điểm Học bạ. Hệ thống tạo sẵn các môn THCS theo chương trình GDPT 2018."
      rows={catalog?.subjects.filter((row) => row.active)}
      columns={['Tên môn học', 'Mã']}
      renderRow={(row) => [row.name, <span key="code" className="code-tag">{row.code}</span>]}
      fields={[
        { key: 'name', label: 'Tên môn học', maxLength: 120 },
        { key: 'code', label: 'Mã', maxLength: 20, upper: true },
      ]}
      emptyForm={{ name: '', code: '' }}
      toForm={(row) => ({ name: row.name, code: row.code })}
      onCreate={(form) => create(form)}
      onUpdate={(row, form) => update({ id: row._id, ...form })}
      onRemove={(row) => remove({ id: row._id })}
      removeText={(row) => `Xóa môn ${row.name}? Không xóa được môn còn trong lịch dạy hiện tại; lịch cũ và điểm đã nhập vẫn giữ tên môn.`}
      noun="môn học"
    />
  );
}

/** Thiết lập loại kiểm tra: Tên + Hệ số điểm (trọng số trong ĐTB môn học kỳ). */
export function TestTypeSettings() {
  const catalog = useCatalog();
  const create = useMutation(anyApi.teachingCatalog.createTestType);
  const update = useMutation(anyApi.teachingCatalog.updateTestType);
  const remove = useMutation(anyApi.teachingCatalog.removeTestType);
  return (
    <CatalogPage
      eyebrow="Thiết lập tối cao"
      title="Thiết lập loại kiểm tra"
      description="Loại kiểm tra giáo viên chọn khi nhập điểm Học bạ. ĐTB môn học kỳ = tổng (điểm × hệ số) / tổng hệ số. Đổi hệ số chỉ áp dụng cho điểm nhập sau đó."
      rows={catalog?.testTypes.filter((row) => row.active)}
      columns={['Tên', 'Hệ số điểm']}
      renderRow={(row) => [row.name, <span key="coef" className="tc-chip tc-chip--blue">Hệ số {row.coefficient}</span>]}
      fields={[
        { key: 'name', label: 'Tên loại kiểm tra', maxLength: 60 },
        { key: 'coefficient', label: 'Hệ số điểm', type: 'number', min: 1, max: 5 },
      ]}
      emptyForm={{ name: '', coefficient: '1' }}
      toForm={(row) => ({ name: row.name, coefficient: String(row.coefficient) })}
      onCreate={(form) => create({ name: form.name, coefficient: Number(form.coefficient) })}
      onUpdate={(row, form) => update({ id: row._id, name: form.name, coefficient: Number(form.coefficient) })}
      onRemove={(row) => remove({ id: row._id })}
      removeText={(row) => `Xóa loại kiểm tra ${row.name}? Điểm đã nhập với loại này vẫn giữ nguyên tên và hệ số.`}
      noun="loại kiểm tra"
    />
  );
}

function CatalogPage({
  eyebrow,
  title,
  description,
  rows,
  columns,
  renderRow,
  fields,
  emptyForm,
  toForm,
  onCreate,
  onUpdate,
  onRemove,
  removeText,
  noun,
}) {
  const task = useAsyncTask();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const reset = () => {
    setEditing(null);
    setForm(emptyForm);
  };

  return (
    <section className="homeroom-view">
      <div className="hr-stack">
        <header className="tc-page-head">
          <div>
            <span className="hr-eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
            <p className="hr-muted">{description}</p>
          </div>
        </header>

        <form
          className="hr-panel"
          onSubmit={async (event) => {
            event.preventDefault();
            const outcome = editing
              ? await task.run(() => onUpdate(editing, form), `Đã cập nhật ${noun}.`)
              : await task.run(() => onCreate(form), `Đã thêm ${noun}.`);
            if (outcome.ok) reset();
          }}
        >
          <div className="hr-panel-head">
            <div>
              <h3>{editing ? `Sửa: ${editing.name}` : `Thêm ${noun}`}</h3>
            </div>
            {editing ? (
              <button type="button" className="hr-button hr-button--ghost hr-button--sm" onClick={reset}>Hủy sửa</button>
            ) : null}
          </div>
          <div className="tc-catalog-form">
            {fields.map((field) => (
              <label key={field.key} className="hr-field">
                <span>{field.label}</span>
                <input
                  required
                  type={field.type || 'text'}
                  min={field.min}
                  max={field.max}
                  step={field.type === 'number' ? 1 : undefined}
                  maxLength={field.maxLength}
                  value={form[field.key]}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [field.key]: field.upper ? event.target.value.toUpperCase() : event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <button className="primary-button" disabled={task.pending}>
              {task.pending ? 'Đang lưu…' : editing ? 'Lưu' : <><Icon name="plus" size={15} /> Thêm</>}
            </button>
          </div>
          <Feedback error={task.error} success={task.success} />
        </form>

        {rows === undefined ? (
          <Loading />
        ) : !rows.length ? (
          <EmptyState icon="inbox" title={`Chưa có ${noun}.`}>Thêm {noun} đầu tiên ở biểu mẫu phía trên.</EmptyState>
        ) : (
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  {columns.map((column) => <th key={column} scope="col">{column}</th>)}
                  <th scope="col" className="is-actions">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const cells = renderRow(row);
                  return (
                    <tr key={row._id}>
                      <th scope="row">{cells[0]}</th>
                      {cells.slice(1).map((cell, index) => <td key={index}>{cell}</td>)}
                      <td className="is-actions">
                        <div className="hr-row hr-row--end">
                          <button
                            type="button"
                            className="hr-button hr-button--sm"
                            disabled={task.pending}
                            onClick={() => {
                              setEditing(row);
                              setForm(toForm(row));
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            Sửa
                          </button>
                          <button type="button" className="hr-button hr-button--sm hr-button--danger-ghost" disabled={task.pending} onClick={() => setRemoving(row)}>
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {removing ? (
        <ConfirmActionModal
          title={`Xóa ${noun}?`}
          description={removeText(removing)}
          confirmLabel="Xóa"
          tone="danger"
          pending={task.pending}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            // Lỗi (ví dụ môn còn trong lịch dạy) hiện ở đầu trang sau khi đóng hộp xác nhận.
            await task.run(() => onRemove(removing), `Đã xóa ${noun}.`);
            setRemoving(null);
          }}
        />
      ) : null}
    </section>
  );
}
