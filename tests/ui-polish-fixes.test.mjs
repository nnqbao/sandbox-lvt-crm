import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('chat filters wrap in a narrow list instead of hiding "Nhóm" off-screen', () => {
  const css = read('src/chat/chatHub.css');
  const rule = css.slice(css.indexOf('.chat-filters {'), css.indexOf('}', css.indexOf('.chat-filters {')));
  assert.match(rule, /flex-wrap: wrap;/);
  assert.doesNotMatch(rule, /overflow-x: auto/);
});

test('duty cards lay out by their own width (Nhân sự column open on 1280px)', () => {
  const css = read('src/duties/duties.css');
  assert.match(css, /\.duty-modern-card \{\n\s+container: duty-card \/ inline-size;/);
  assert.match(css, /@container duty-card \(max-width: 760px\) \{\n\s+\.duty-card-layout \{\n\s+grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /@container duty-card \(max-width: 520px\) \{\n\s+\.duty-card-body \{\n\s+grid-template-columns: minmax\(0, 1fr\);/);
});

test('people review: evaluator name and time are visually separated', () => {
  const css = read('src/peopleReview/peopleReview.css');
  assert.match(css, /\.pr-mini-text > strong \{\n\s+margin-right: 0\.5rem;/);
});

test('work screens speak Vietnamese and show late submissions to every reviewer', () => {
  const views = read('src/work/WorkViews.jsx');
  for (const english of ['Trả về user', 'task đang chờ', 'hoàn thành task', 'trả task', 'Admin/Mod duyệt hoàn thành']) {
    assert.ok(!views.includes(english), english);
  }
  assert.match(views, /Đang chờ người giao việc duyệt hoàn thành\./);
  assert.equal((views.match(/\{item\.submittedLate \? <span className="work-late-flag">Nộp trễ<\/span> : null\}/g) || []).length, 2, 'both review queues flag late submissions');
  assert.doesNotMatch(read('src/work/WorkAssignmentRows.jsx'), /thêm row/);
  const errors = read('src/lib/appErrorMessage.js');
  assert.doesNotMatch(errors, /Chỉ user cấp|hoàn thành task/);
});

test('Công việc: assigned work is "Việc được giao"; "Việc của tôi" is only the personal to-do tab', () => {
  const views = read('src/work/WorkViews.jsx');
  assert.match(views, /<DutyListHeading>Việc được giao<\/DutyListHeading>/);
  assert.doesNotMatch(views, /<DutyListHeading>Việc của tôi<\/DutyListHeading>/);
  assert.match(read('src/work/PersonalTodosView.jsx'), /<h2>Việc của tôi<\/h2>/);
});

test('Công việc error messages say "việc", never the English "task"', () => {
  const messages = read('src/lib/appErrorMessage.js');
  assert.match(messages, /WORK_COMPLETION_NOT_PENDING: 'Việc này không còn ở trạng thái chờ duyệt hoàn thành\.'/);
  assert.doesNotMatch(messages, /: '[^'\n]*\b[Tt]ask\b/);
});
