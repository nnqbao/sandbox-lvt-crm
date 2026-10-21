// Đánh giá nhân sự + Ghi nhận lỗi. Fictional people only.
import { DAY, T0, USERS, departmentById, positionById, userById } from './personas.js';

const level = (u) => positionById(u.positionId)?.level || 0;
const isOps = (u) => u.role === 'admin' || u.role === 'moderator';

function personRow(u, actor) {
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

function overview(_args, { persona }) {
  const lv = level(persona);
  const team = isOps(persona) || lv >= 2;
  const people = team
    ? USERS.filter((u) => u._id !== persona._id && u.role === 'user' && (isOps(persona) || lv >= 4 || (u.departmentId === persona.departmentId && level(u) < lv)))
    : [];
  return {
    mode: team ? 'team' : 'self',
    self: { _id: persona._id, name: persona.name },
    actor: { canSelfUpload: true, canSelfFault: false },
    people: people.map((u) => personRow(u, persona)),
  };
}

function personDetail(args, { persona }) {
  const u = userById(args.userId) || persona;
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

function staffFaultLog(_args, { persona }) {
  const canAdd = isOps(persona) || level(persona) >= 2;
  const f = (id, date, targetId, recorderId, reason, fileName) => ({
    _id: id, violationDate: date, targetName: userById(targetId).name, departmentName: departmentById(userById(targetId).departmentId)?.name || '',
    recordedByName: userById(recorderId).name, reason, fileName,
    isSelfTarget: targetId === persona._id, isRecordedByMe: recorderId === persona._id,
  });
  return {
    canAdd,
    faults: [
      f('sf1', '2026-10-06', 'u_teacher', 'u_leader', 'Nộp sổ điểm tháng 9 trễ 3 ngày.', 'bien-ban-nhac-nho.pdf'),
      f('sf2', '2026-10-14', 'u_t5', 'u_leader', 'Vắng sinh hoạt chuyên môn không báo trước.', 'anh-so-ky-ten.jpg'),
      f('sf3', '2026-09-28', 'u_t5', 'u_leader', 'Chưa cập nhật kế hoạch bài dạy lên hệ thống đúng hạn.', 'bien-ban.pdf'),
    ],
  };
}

export const queries = {
  'peopleReview:overview': overview,
  'peopleReview:personDetail': personDetail,
  'peopleReview:staffFaultLog': staffFaultLog,
  'peopleReview:staffFaultTargets': (_args, { persona }) => ({
    people: USERS.filter((u) => u.departmentId === persona.departmentId && level(u) < level(persona)).map((u) => personRow(u, persona)),
  }),
};
