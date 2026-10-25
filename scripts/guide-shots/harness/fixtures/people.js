// Đánh giá nhân sự + Ghi nhận lỗi. Fictional people only.
import { DAY, T0, USERS, departmentById, positionById, userById } from './personas.js';

const level = (u) => positionById(u.positionId)?.level || 0;
const isOps = (u) => u.role === 'admin' || u.role === 'moderator';

// Videos pass state.peopleAppRules to mirror convex/peopleReview.ts permission rules exactly
// (who may upload, write BGH text, record a fault). Screenshots keep the simplified rules below.
const opsLevel = (u) => (isOps(u) ? 0 : level(u));
const subordinate = (actor, target) =>
  actor._id !== target._id && Boolean(actor.departmentId) && target.departmentId === actor.departmentId
  && !isOps(target) && opsLevel(actor) >= 1 && opsLevel(target) >= 1 && opsLevel(actor) > opsLevel(target);
function appCanUpload(actor, target) {
  const al = opsLevel(actor);
  const tl = opsLevel(target);
  if (actor._id === target._id) return isOps(actor) || (al >= 2 && al <= 5);
  if (isOps(target)) return false;
  if (tl === 1) return (al === 2 || al === 3) && subordinate(actor, target);
  if (tl === 2) return al === 3 && subordinate(actor, target);
  return false;
}
function appCanWriteText(actor, target) {
  const al = opsLevel(actor);
  const tl = opsLevel(target);
  if (actor._id === target._id) return false;
  if (isOps(target)) return al === 4 || al === 5;
  if (tl === 5) return false;
  if (tl === 4) return al === 5;
  if (tl >= 1 && tl <= 3) return isOps(actor) || al === 4 || al === 5;
  return false;
}
function appCanRecordFault(actor, target) {
  const al = opsLevel(actor);
  const tl = opsLevel(target);
  if (!isOps(target) && tl === 5) return false;
  if (actor._id === target._id) return isOps(actor);
  if (isOps(actor)) return !isOps(target) && tl !== 4 && tl !== 5;
  if (al === 5) return isOps(target) || tl === 4;
  if (al === 4) return isOps(target);
  if (al === 2 || al === 3) return subordinate(actor, target);
  return false;
}

function personRow(u, actor, state = {}) {
  if (state.peopleAppRules) {
    return {
      _id: u._id,
      name: u.name,
      email: u.email,
      departmentName: departmentById(u.departmentId)?.name || '',
      positionName: positionById(u.positionId)?.name || '',
      positionLevel: level(u),
      isOps: isOps(u),
      canUpload: appCanUpload(actor, u),
      canWriteText: appCanWriteText(actor, u),
      canRecordFault: appCanRecordFault(actor, u),
    };
  }
  const actorLevel = level(actor);
  const sameDept = u.departmentId === actor.departmentId;
  const manages = isOps(actor) || actorLevel >= 4 || (sameDept && level(u) < actorLevel && actorLevel >= 2);
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    departmentName: departmentById(u.departmentId)?.name || '',
    positionName: positionById(u.positionId)?.name || '',
    positionLevel: level(u),
    isOps: isOps(u),
    canUpload: manages,
    canWriteText: actorLevel >= 4 && !isOps(actor),
    canRecordFault: manages,
  };
}

function overview(_args, { persona, state }) {
  const lv = level(persona);
  const team = isOps(persona) || lv >= 2;
  const people = team
    ? USERS.filter((u) => u._id !== persona._id && u.role === 'user' && (isOps(persona) || lv >= 4 || (u.departmentId === persona.departmentId && level(u) < lv)))
    : [];
  return {
    mode: team ? 'team' : 'self',
    self: { _id: persona._id, name: persona.name },
    actor: state.peopleAppRules
      ? { canSelfUpload: appCanUpload(persona, persona), canSelfFault: appCanRecordFault(persona, persona) }
      : { canSelfUpload: true, canSelfFault: false },
    people: people.map((u) => personRow(u, persona, state)),
  };
}

function personDetail(args, { persona, state }) {
  const u = userById(args.userId) || persona;
  const base = personDetailBase(u, persona);
  if (!state.peopleAppRules) return base;
  // Videos: real permissions, upload metadata, plus rows added by state (newest first).
  const evaluations = [...(state.extraEvaluations || []), ...base.evaluations].map((ev) => ({
    lastUploadedAt: T0 - 20 * DAY,
    uploadedByName: 'Lê Thị D',
    ...ev,
    textLocked: (ev.texts || []).length > 0,
  }));
  // Faults of this person only: the same rows the Ghi nhận lỗi menu lists.
  const faults = [...(state.extraFaults || []), ...FAULT_ROWS].filter((f) => f.targetId === u._id).map((f) => ({
    _id: f._id, violationDate: f.violationDate, recordedByName: userById(f.recorderId).name, reason: f.reason, fileName: f.fileName,
  }));
  return {
    ...base,
    permissions: { canUpload: appCanUpload(persona, u), canWriteText: appCanWriteText(persona, u), canRecordFault: appCanRecordFault(persona, u) },
    faults,
    evaluations,
  };
}

function personDetailBase(u, persona) {
  return {
    person: { _id: u._id, name: u.name, departmentName: departmentById(u.departmentId)?.name || '' },
    permissions: { canUpload: true, canWriteText: level(persona) >= 4, canRecordFault: false },
    faults: [
      { _id: 'f1', violationDate: '2026-10-06', recordedByName: 'Lê Thị D', reason: 'Nộp sổ điểm tháng 9 trễ 3 ngày.', fileName: 'bien-ban-nhac-nho.pdf' },
    ],
    workKpi: {
      total: 6, onTime: 3, late: 1, incomplete: 2,
      tasks: [
        { _id: 'k1', content: 'Nộp giáo án chủ đề Phân số', deadline: '2026-10-05', status: 'completed', qualityPercent: 95 },
        { _id: 'k2', content: 'Cập nhật sổ điểm điện tử tháng 9', deadline: '2026-10-10', status: 'completed_late', qualityPercent: 80 },
        { _id: 'k3', content: 'Báo cáo kết quả bồi dưỡng học sinh giỏi', deadline: '2026-10-19', status: 'overdue', qualityPercent: null },
      ],
    },
    evaluations: [
      {
        _id: 'ev1', kind: 'quarterly', periodKey: 'Q3-2026', quarter: 3, year: 2026, fileName: 'tu-danh-gia-quy-3.pdf', textLocked: true, versionCount: 1,
        texts: [{ _id: 'tx1', evaluatorName: 'Hoàng Văn E', createdAt: T0 - 12 * DAY, content: 'Hoàn thành tốt nhiệm vụ. Cần chủ động hơn trong sinh hoạt chuyên môn.' }],
      },
      { _id: 'ev2', kind: 'civil_servant', periodKey: 'CS-2025-2026', schoolYear: '2025-2026', fileName: 'danh-gia-vien-chuc-2025-2026.pdf', textLocked: false, versionCount: 2, texts: [] },
    ],
    boardingOptions: [],
  };
}

const FAULT_ROWS = [
  { _id: 'sf1', violationDate: '2026-10-06', targetId: 'u_teacher', recorderId: 'u_leader', reason: 'Nộp sổ điểm tháng 9 trễ 3 ngày.', fileName: 'bien-ban-nhac-nho.pdf' },
  { _id: 'sf2', violationDate: '2026-10-14', targetId: 'u_t5', recorderId: 'u_leader', reason: 'Vắng sinh hoạt chuyên môn không báo trước.', fileName: 'anh-so-ky-ten.jpg' },
  { _id: 'sf3', violationDate: '2026-09-28', targetId: 'u_t5', recorderId: 'u_leader', reason: 'Chưa cập nhật kế hoạch bài dạy lên hệ thống đúng hạn.', fileName: 'bien-ban.pdf' },
];

function staffFaultLog(_args, { persona, state }) {
  const canAdd = isOps(persona) || level(persona) >= 2;
  const f = (id, date, targetId, recorderId, reason, fileName) => ({
    _id: id, violationDate: date, targetName: userById(targetId).name, departmentName: departmentById(userById(targetId).departmentId)?.name || '',
    recordedByName: userById(recorderId).name, reason, fileName,
    isSelfTarget: targetId === persona._id, isRecordedByMe: recorderId === persona._id,
  });
  const extra = (state.extraFaults || []).map((row) => f(row._id, row.violationDate, row.targetId, row.recorderId, row.reason, row.fileName));
  return {
    canAdd,
    faults: [...extra, ...FAULT_ROWS.map((row) => f(row._id, row.violationDate, row.targetId, row.recorderId, row.reason, row.fileName))],
  };
}

export const queries = {
  'peopleReview:overview': overview,
  'peopleReview:personDetail': personDetail,
  'peopleReview:staffFaultLog': staffFaultLog,
  'peopleReview:staffFaultTargets': (_args, { persona, state }) => (state.peopleAppRules ? {
    canAdd: true,
    people: USERS.filter((u) => u.status === 'active' && appCanRecordFault(persona, u))
      .map((u) => personRow(u, persona, state))
      .sort((a, b) => a.departmentName.localeCompare(b.departmentName, 'vi') || a.name.localeCompare(b.name, 'vi')),
  } : {
    people: USERS.filter((u) => u.departmentId === persona.departmentId && level(u) < level(persona)).map((u) => personRow(u, persona)),
  }),
};

// Text-only BGH comments close the modal like the real save (uploads stop at the mocked gateway).
export const mutations = {
  'peopleReview:saveEvaluationBatch': () => ({ cleanupJobIds: [] }),
};
