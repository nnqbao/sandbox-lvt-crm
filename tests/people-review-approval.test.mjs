import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canReviewEvaluationText,
  canSeeEvaluationText,
  canWriteEvaluationTextRule,
  countedEvaluatorId,
  EVALUATION_APPROVED_NOTICE_MS,
  evaluationFileTextLocked,
  evaluationReviewNotificationKey,
  evaluationReviewPushText,
  evaluationTextReviewError,
  evaluationTextStatus,
  evaluationTextWriteDecision,
  evaluationWriterNotice,
  isBghReviewer,
  STAFF_FAULT_NOTICE_MS,
  staffFaultNoticeVisible,
  staffFaultPushText,
} from '../convex/peopleReviewPolicy.ts';
import { menuForNotification, peopleNotificationLabel } from '../src/notifications/useNotificationFocus.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const DAY = 24 * 60 * 60 * 1000;

const legacy = { _id: 't0', evaluatorUserId: 'bgh-old', active: true };
const pending = {
  _id: 't1',
  evaluatorUserId: 'vanthu',
  active: true,
  status: 'pending',
  writtenOnBehalf: true,
  submittedAt: 100,
};
const approvedOnBehalf = {
  ...pending,
  _id: 't2',
  status: 'approved',
  reviewedByUserId: 'hieupho',
  reviewedAt: 200,
};

test('legacy comments without status stay approved and keep locking the file', () => {
  assert.equal(evaluationTextStatus(legacy), 'approved');
  assert.equal(countedEvaluatorId(legacy), 'bgh-old');
  assert.equal(evaluationFileTextLocked([legacy]), true);
});

test('pending / returned comments do not lock the file and count for nobody', () => {
  assert.equal(evaluationFileTextLocked([pending]), false);
  assert.equal(evaluationFileTextLocked([{ ...pending, status: 'returned' }]), false);
  assert.equal(countedEvaluatorId(pending), null);
  assert.equal(evaluationFileTextLocked([pending, approvedOnBehalf]), true);
  // An approved on-behalf comment counts as the approving BGH member's comment.
  assert.equal(countedEvaluatorId(approvedOnBehalf), 'hieupho');
  assert.equal(evaluationFileTextLocked([{ ...approvedOnBehalf, active: false }]), false);
});

test('văn thư (admin/mod) comments start pending; BGH comments are approved at once', () => {
  const ops = evaluationTextWriteDecision({ actorUserId: 'vanthu', actorIsOps: true, texts: [], own: null });
  assert.deepEqual(ops, { ok: true, mode: 'create', status: 'pending', writtenOnBehalf: true });
  const bgh = evaluationTextWriteDecision({ actorUserId: 'hieupho', actorIsOps: false, texts: [], own: null });
  assert.deepEqual(bgh, { ok: true, mode: 'create', status: 'approved', writtenOnBehalf: false });
});

test('the writer edits a pending/returned comment instead of adding a second one', () => {
  for (const status of ['pending', 'returned']) {
    const own = { ...pending, status };
    const decision = evaluationTextWriteDecision({ actorUserId: 'vanthu', actorIsOps: true, texts: [own], own });
    assert.equal(decision.ok, true);
    assert.equal(decision.mode, 'update');
    assert.equal(decision.status, 'pending');
  }
  const done = evaluationTextWriteDecision({
    actorUserId: 'vanthu',
    actorIsOps: true,
    texts: [approvedOnBehalf],
    own: approvedOnBehalf,
  });
  assert.deepEqual(done, { ok: false, error: 'EVALUATION_TEXT_ALREADY_SUBMITTED' });
});

test('one comment per BGH member includes on-behalf comments they approved, not pending ones', () => {
  assert.equal(
    evaluationTextWriteDecision({ actorUserId: 'hieupho', actorIsOps: false, texts: [approvedOnBehalf], own: null }).ok,
    false,
  );
  assert.equal(
    evaluationTextWriteDecision({ actorUserId: 'hieupho', actorIsOps: false, texts: [pending], own: null }).ok,
    true,
  );
});

test('BGH = active non-ops 4–5★; the existing write rule decides who may review', () => {
  assert.equal(isBghReviewer({ isOps: false, level: 4 }), true);
  assert.equal(isBghReviewer({ isOps: false, level: 5 }), true);
  assert.equal(isBghReviewer({ isOps: false, level: 3 }), false);
  assert.equal(isBghReviewer({ isOps: true, level: 5 }), false);

  const base = { actorUserId: 'a', targetUserId: 't', actorReachesTarget: false, targetIsOps: false };
  assert.equal(canWriteEvaluationTextRule({ ...base, actorIsOps: false, actorLevel: 4, targetLevel: 2 }), true);
  assert.equal(canWriteEvaluationTextRule({ ...base, actorIsOps: false, actorLevel: 4, targetLevel: 4 }), false);
  assert.equal(canWriteEvaluationTextRule({ ...base, actorIsOps: false, actorLevel: 5, targetLevel: 4 }), true);
  assert.equal(canWriteEvaluationTextRule({ ...base, actorIsOps: false, actorLevel: 5, targetLevel: 5 }), false);
  assert.equal(canWriteEvaluationTextRule({ ...base, actorIsOps: true, actorLevel: 0, targetLevel: 2 }), false);
  assert.equal(
    canWriteEvaluationTextRule({ ...base, actorIsOps: true, actorLevel: 0, actorReachesTarget: true, targetLevel: 2 }),
    true,
  );
  assert.equal(canWriteEvaluationTextRule({ ...base, actorIsOps: false, actorLevel: 4, targetUserId: 'a', targetLevel: 2 }), false);
});

test('review: only an eligible BGH member, only pending, return needs a reason', () => {
  const reviewer = {
    reviewerUserId: 'hieupho',
    reviewerIsOps: false,
    reviewerLevel: 4,
    reviewerCanWriteForTarget: true,
    fileTexts: [pending],
  };
  assert.equal(evaluationTextReviewError({ ...reviewer, text: pending, decision: 'approve' }), null);
  assert.equal(canReviewEvaluationText({ ...reviewer, text: pending }), true);
  assert.equal(
    evaluationTextReviewError({ ...reviewer, reviewerIsOps: true, text: pending, decision: 'approve' }),
    'PEOPLE_REVIEW_TEXT_REVIEW_FORBIDDEN',
  );
  assert.equal(
    evaluationTextReviewError({ ...reviewer, reviewerLevel: 3, text: pending, decision: 'approve' }),
    'PEOPLE_REVIEW_TEXT_REVIEW_FORBIDDEN',
  );
  assert.equal(
    evaluationTextReviewError({ ...reviewer, reviewerCanWriteForTarget: false, text: pending, decision: 'approve' }),
    'PEOPLE_REVIEW_TEXT_REVIEW_FORBIDDEN',
  );
  assert.equal(
    evaluationTextReviewError({ ...reviewer, text: approvedOnBehalf, decision: 'approve' }),
    'EVALUATION_TEXT_NOT_PENDING',
  );
  assert.equal(
    evaluationTextReviewError({ ...reviewer, text: { ...pending, status: 'returned' }, decision: 'approve' }),
    'EVALUATION_TEXT_NOT_PENDING',
  );
  assert.equal(
    evaluationTextReviewError({ ...reviewer, text: { ...pending, active: false }, decision: 'approve' }),
    'EVALUATION_TEXT_NOT_FOUND',
  );
  assert.equal(
    evaluationTextReviewError({ ...reviewer, text: pending, decision: 'return', reason: '   ' }),
    'EVALUATION_RETURN_REASON_INVALID',
  );
  assert.equal(
    evaluationTextReviewError({ ...reviewer, text: pending, decision: 'return', reason: 'x'.repeat(1001) }),
    'EVALUATION_RETURN_REASON_INVALID',
  );
  assert.equal(evaluationTextReviewError({ ...reviewer, text: pending, decision: 'return', reason: 'Sửa ý 2' }), null);
  // A BGH member who already has a counted comment on the file cannot approve another one.
  const own = { _id: 'mine', evaluatorUserId: 'hieupho', active: true, status: 'approved' };
  assert.equal(
    evaluationTextReviewError({ ...reviewer, fileTexts: [pending, own], text: pending, decision: 'approve' }),
    'EVALUATION_TEXT_ALREADY_SUBMITTED',
  );
  assert.equal(
    evaluationTextReviewError({ ...reviewer, fileTexts: [pending, own], text: pending, decision: 'return', reason: 'x' }),
    null,
  );
});

test('pending comments stay hidden from the evaluated person and from everyone not involved', () => {
  const base = { text: pending, targetUserId: 'gv', viewerOpsInScope: false, viewerIsEligibleReviewer: false };
  assert.equal(canSeeEvaluationText({ ...base, viewerUserId: 'gv' }), false);
  assert.equal(canSeeEvaluationText({ ...base, viewerUserId: 'gv', viewerIsEligibleReviewer: true }), false);
  assert.equal(canSeeEvaluationText({ ...base, viewerUserId: 'totruong' }), false);
  assert.equal(canSeeEvaluationText({ ...base, viewerUserId: 'vanthu' }), true);
  assert.equal(canSeeEvaluationText({ ...base, viewerUserId: 'mod', viewerOpsInScope: true }), true);
  assert.equal(canSeeEvaluationText({ ...base, viewerUserId: 'hieupho', viewerIsEligibleReviewer: true }), true);
  assert.equal(canSeeEvaluationText({ ...base, text: { ...pending, status: 'returned' }, viewerUserId: 'gv' }), false);
  // Approved comments follow the existing "can view the target" rule.
  assert.equal(canSeeEvaluationText({ ...base, text: approvedOnBehalf, viewerUserId: 'gv' }), true);
});

test('writer bell: returned until resubmitted, approved for a week', () => {
  const now = 10 * DAY;
  const returned = { ...pending, status: 'returned', reviewedAt: now - DAY };
  assert.deepEqual(evaluationWriterNotice(returned, 'vanthu', now), { decision: 'returned', at: now - DAY });
  assert.equal(evaluationWriterNotice(returned, 'someone-else', now), null);
  assert.equal(evaluationWriterNotice(pending, 'vanthu', now), null);
  const approved = { ...approvedOnBehalf, reviewedAt: now - DAY };
  assert.deepEqual(evaluationWriterNotice(approved, 'vanthu', now), { decision: 'approved', at: now - DAY });
  assert.equal(
    evaluationWriterNotice({ ...approved, reviewedAt: now - EVALUATION_APPROVED_NOTICE_MS - 1 }, 'vanthu', now),
    null,
  );
  assert.equal(evaluationWriterNotice({ ...legacy, reviewedAt: now }, 'bgh-old', now), null);
  assert.notEqual(evaluationReviewNotificationKey('t1', 100), evaluationReviewNotificationKey('t1', 200));
});

test('fault bell: only the evaluated person, never self-recorded, 30 days', () => {
  const now = 100 * DAY;
  const fault = { targetUserId: 'gv', recordedByUserId: 'totruong', active: true, createdAt: now - DAY };
  assert.equal(staffFaultNoticeVisible(fault, 'gv', now), true);
  assert.equal(staffFaultNoticeVisible(fault, 'totruong', now), false);
  assert.equal(staffFaultNoticeVisible({ ...fault, recordedByUserId: 'gv' }, 'gv', now), false);
  assert.equal(staffFaultNoticeVisible({ ...fault, active: false }, 'gv', now), false);
  assert.equal(staffFaultNoticeVisible({ ...fault, createdAt: now - STAFF_FAULT_NOTICE_MS - 1 }, 'gv', now), false);
});

test('push copy never carries the fault reason or the comment text', () => {
  const fault = staffFaultPushText('2026-10-24');
  assert.equal(fault.title, 'Ghi nhận lỗi mới');
  assert.equal(fault.body, 'Có một ghi nhận lỗi ngày 24/10/2026. Mở ứng dụng để xem chi tiết.');
  for (const kind of ['submitted', 'approved', 'returned']) {
    const push = evaluationReviewPushText({ kind, targetName: 'Nguyễn Văn A', periodLabel: 'Quý 3/2026' });
    assert.match(push.body, /Nguyễn Văn A \(Quý 3\/2026\)/);
  }
  assert.equal(evaluationReviewPushText({ kind: 'submitted', targetName: 'A', periodLabel: 'Q' }).title, 'Nhận xét chờ duyệt');
});

test('people bell items open the menu the server picked', () => {
  assert.equal(menuForNotification({ kind: 'people', sourceType: 'staff_fault', menu: 'staff-faults' }), 'staff-faults');
  assert.equal(menuForNotification({ kind: 'people', sourceType: 'staff_fault', menu: 'people-review' }), 'people-review');
  assert.equal(menuForNotification({ kind: 'people', sourceType: 'evaluation_text_review' }), 'people-review');
  assert.equal(menuForNotification({ kind: 'people', sourceType: 'staff_fault' }), 'staff-faults');
  assert.equal(peopleNotificationLabel({ sourceType: 'staff_fault' }), 'Ghi nhận lỗi');
  assert.equal(peopleNotificationLabel({ sourceType: 'evaluation_text_returned' }), 'Đánh giá nhân sự');
});

test('server wiring: approval enforced in mutations, pushes and feed stay content-free', () => {
  const peopleReview = read('convex/peopleReview.ts');
  // recordFault pushes the target only, never the recorder, with the reason-free copy.
  assert.match(peopleReview, /if \(String\(target\._id\) !== String\(access\.user\._id\)\) \{\s*const push = staffFaultPushText\(violationDate\);/);
  assert.doesNotMatch(peopleReview, /body: [^\n]*reason/);
  // Every write goes through the shared decision; file lock counts approved comments only.
  assert.equal((peopleReview.match(/evaluationFileTextLocked\(texts\)/g) || []).length, 2);
  assert.match(peopleReview, /const decision = evaluationTextWriteDecision\(/);
  assert.match(peopleReview, /export const reviewEvaluationText = mutation\(\{[\s\S]*?requirePeopleReviewAccess\(ctx\)[\s\S]*?evaluationTextReviewError\(\{[\s\S]*?EVALUATION_TEXT_CHANGED/);
  assert.match(peopleReview, /export const resubmitEvaluationText = mutation\(\{[\s\S]*?String\(text\.evaluatorUserId\) !== String\(access\.user\._id\)[\s\S]*?canWriteEvaluationText\(access, target\)/);
  assert.match(peopleReview, /export const evaluationReviewQueue = query\(\{[\s\S]*?mapEvaluationTextForViewer\(access, target, text/);
  // Bundles filter per viewer (the evaluated person never sees pending/returned).
  assert.match(peopleReview, /loadEvaluationBundle\(ctx, access\.user, access\)/);
  assert.match(peopleReview, /loadEvaluationBundle\(ctx, target, access\)/);

  const notifications = read('convex/notifications.ts');
  assert.match(notifications, /const peopleItems = await peopleNotificationItems\(ctx, user, menuAccess, level, positions, now\);/);
  assert.match(notifications, /staffFaultNoticeVisible\(fault, String\(user\._id\), now\)/);
  assert.doesNotMatch(notifications, /fault\.reason/);
  assert.doesNotMatch(notifications, /text\.content|returnReason/);

  const schema = read('convex/schema.ts');
  assert.match(schema, /status: v\.optional\(v\.union\(v\.literal\("pending"\), v\.literal\("approved"\), v\.literal\("returned"\)\)\)/);
  assert.match(schema, /\.index\("by_status", \["status", "active"\]\)/);
});

test('web: status badges, Duyệt / Trả lại actions and the notifications section', () => {
  const view = read('src/peopleReview/PeopleReviewView.jsx');
  assert.match(view, /pending: 'Chờ BGH duyệt', returned: 'Bị trả lại'/);
  assert.match(view, /decision: 'approve'/);
  assert.match(view, /decision: 'return'/);
  assert.match(view, /anyApi\.peopleReview\.evaluationReviewQueue/);
  assert.match(view, /text\.status === 'approved'\)\.length\} BGH đánh giá/);
  const faults = read('src/peopleReview/StaffFaultsView.jsx');
  assert.match(faults, /useNotificationFocus\(focusTarget, \{ acceptSourceTypes: \['staff_fault'\] \}\)/);
  const notifications = read('src/notifications/NotificationsView.jsx');
  assert.match(notifications, /kind="people"/);
  const shell = read('src/main.jsx');
  assert.match(shell, /<PeopleReviewView focusTarget=\{activeFocusTarget\} \/>/);
  assert.match(shell, /<StaffFaultsView focusTarget=\{activeFocusTarget\} \/>/);
});
