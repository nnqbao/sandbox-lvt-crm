import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

function assertSafeSettlementFlow(source, mutationMarker) {
  const retry = source.indexOf('if (pendingSettlement)');
  const mutation = source.indexOf(mutationMarker);
  const commit = source.indexOf('crmCommitted = true;', mutation);
  const finalize = source.indexOf(', true)', commit);
  const committedFailure = source.indexOf('if (crmCommitted)', finalize);
  const preCommitFailure = source.indexOf(', false)', committedFailure);

  assert.ok(retry >= 0 && retry < mutation, 'settlement retry must bypass the CRM mutation');
  assert.ok(mutation < commit && commit < finalize, 'finalization must happen only after the CRM commit');
  assert.ok(finalize < committedFailure && committedFailure < preCommitFailure,
    'DELETE settlement must remain in the pre-commit failure branch');
  assert.match(source.slice(committedFailure, preCommitFailure), /setPendingSettlement/);
  assert.doesNotMatch(source.slice(committedFailure, preCommitFailure), /, false\)/);
}

test('people review submits retain committed uploads and retry settlement without another mutation', async () => {
  const source = await readFile(new URL('../src/peopleReview/PeopleReviewView.jsx', import.meta.url), 'utf8');
  const fault = section(source, 'function FaultModal(', 'function EvaluationModal(');
  const evaluation = section(source, 'function EvaluationModal(', 'function PersonDashboard(');

  assertSafeSettlementFlow(fault, 'await recordFault({');
  assertSafeSettlementFlow(evaluation, 'const result = await saveBatch({');
});

test('work document submit retains committed uploads and retries settlement without another mutation', async () => {
  const source = await readFile(new URL('../src/work/WorkViews.jsx', import.meta.url), 'utf8');
  const management = section(source, 'export function WorkManagement(', 'export function WorkUserView(');

  assertSafeSettlementFlow(management, 'await createDocument({');
  assert.match(management, /uploaded\?\.error \|\| `WORK_UPLOAD_FAILED:/);
  assert.match(management, /workUploadErrorMessage\(error\?\.message\)/);
  assert.match(source, /UPLOAD_REGISTRATION_FAILED[\s\S]*Hệ thống chưa thể lưu tệp công văn/);
});
