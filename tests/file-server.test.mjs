import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DriveUploadStages } from '../scripts/lib/drive-upload-stages.mjs';
import { isTransientDriveDownloadError, retryDriveDownload } from '../scripts/lib/drive-download-retry.mjs';
import { canMutateWorkDocument, canRejectWorkDocument } from '../convex/workDocumentPolicy.ts';
import { FileHttpError, classifyFileError } from '../scripts/lib/file-http-errors.mjs';
import { canonicalUploadMime, downloadContentPolicy } from '../scripts/lib/file-content-policy.mjs';
import { matchAvatarFileRoute, matchDriveMutationRoute } from '../scripts/lib/file-route-policy.mjs';
import {
  assertStagedUploadOwner,
  settleClaimedUpload,
  throwUploadRegistrationError,
} from '../scripts/lib/staged-upload-cleanup.mjs';
import { authorizeUpload, uploadApiForPurpose } from '../scripts/lib/upload-authorization.mjs';

const uploadApis = {
  work: {
    authorizeFileUpload: 'work-authorize',
    registerDriveUpload: 'work-register',
    finalizeStagedUpload: 'work-finalize',
  },
  peopleReview: {
    authorizeFileUpload: 'people-review-authorize',
    registerDriveUpload: 'people-review-register',
    finalizeStagedUpload: 'people-review-finalize',
  },
};

test('file errors preserve truthful authentication, validation, and infrastructure statuses', () => {
  assert.equal(classifyFileError(new Error('UNAUTHORIZED')).status, 401);
  assert.equal(classifyFileError(new Error('{"code":"InvalidAuthHeader","message":"Could not parse JWT payload."}')).status, 401);
  assert.equal(classifyFileError(new Error('Could not verify OIDC token claim')).status, 401);
  assert.equal(classifyFileError(new Error('INVALID_DATE_RANGE')).status, 400);
  assert.equal(classifyFileError(new Error('WORK_FILE_TOO_LARGE')).status, 413);
  assert.equal(classifyFileError(new Error('WORK_FILE_SIZE_MISMATCH')).status, 400);
  assert.equal(classifyFileError(new Error('WORK_FILE_FORBIDDEN')).status, 403);
  assert.equal(classifyFileError(new Error('drive unavailable')).status, 500);
  assert.equal(classifyFileError(new FileHttpError(502, 'DRIVE_DELETE_FAILED')).status, 502);
  assert.equal(classifyFileError(new Error('context deadline exceeded')).status, 503);
  assert.equal(classifyFileError(new Error('DRIVE_DOWNLOAD_QUEUE_FULL')).status, 503);
});

test('work documents stay editable until the first approval or an assignee submits', () => {
  assert.equal(canMutateWorkDocument({ status: 'approved' }), true);
  assert.equal(canMutateWorkDocument({ status: 'pending' }), true);
  assert.equal(canMutateWorkDocument({ status: 'rejected', rejectedByUserIds: ['principal'] }), true);
  assert.equal(canMutateWorkDocument({ status: 'pending', approvedByUserIds: ['vice-principal'] }), false);
  assert.equal(canMutateWorkDocument({ status: 'approved', approvedByUserIds: ['principal'] }), false);
  assert.equal(canMutateWorkDocument({ status: 'approved', active: false }), false);
  assert.equal(
    canMutateWorkDocument({ status: 'approved' }, [{ completions: [{ status: 'pending_approval' }] }]),
    false,
  );
  assert.equal(
    canMutateWorkDocument({ status: 'approved' }, [{ completions: [{ status: 'rejected' }] }]),
    true,
  );
});

test('reject is blocked after any approval so the document cannot get stuck immutable+rejected', () => {
  assert.equal(canRejectWorkDocument({ status: 'pending', approvedByUserIds: [], rejectedByUserIds: [] }), true);
  assert.equal(
    canRejectWorkDocument({ status: 'pending', approvedByUserIds: ['vice-principal'], rejectedByUserIds: [] }),
    false,
  );
  assert.equal(
    canRejectWorkDocument({ status: 'rejected', approvedByUserIds: [], rejectedByUserIds: ['principal'] }),
    false,
  );
  assert.equal(canRejectWorkDocument({ status: 'approved', approvedByUserIds: ['principal'] }), false);
});

test('Drive downloads retry bounded transient timeouts but not authorization failures', async () => {
  assert.equal(isTransientDriveDownloadError(new Error('context deadline exceeded')), true);
  assert.equal(isTransientDriveDownloadError(new Error('WORK_FILE_FORBIDDEN')), false);

  let calls = 0;
  const result = await retryDriveDownload(async () => {
    calls += 1;
    if (calls < 3) throw new Error('Client.Timeout exceeded while awaiting headers');
    return 'downloaded';
  }, { delays: [0, 0], random: () => 0, sleep: async () => {} });
  assert.equal(result, 'downloaded');
  assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(
    retryDriveDownload(async () => {
      calls += 1;
      throw new Error('WORK_FILE_FORBIDDEN');
    }, { sleep: async () => {} }),
    /WORK_FILE_FORBIDDEN/,
  );
  assert.equal(calls, 1);
});

test('upload and download MIME policy ignores a spoofed request or stored content type', () => {
  assert.equal(canonicalUploadMime('report.pdf'), 'application/pdf');
  assert.equal(canonicalUploadMime('sheet.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(canonicalUploadMime('payload.html'), null);
  assert.deepEqual(downloadContentPolicy('report.pdf'), {
    mimeType: 'application/pdf',
    disposition: 'attachment',
  });
  assert.deepEqual(downloadContentPolicy('evidence.png'), {
    mimeType: 'image/png',
    disposition: 'inline',
  });
  assert.deepEqual(downloadContentPolicy('avatar.webp'), {
    mimeType: 'image/webp',
    disposition: 'inline',
  });
});

test('Drive mutation routes accept only scoped upload tokens or trusted cleanup jobs', () => {
  assert.equal(matchDriveMutationRoute('DELETE', '/api/files/drive/caller-supplied-drive-id'), null);
  assert.deepEqual(matchDriveMutationRoute('DELETE', '/api/files/uploads/stage-token'), {
    kind: 'staged-upload',
    id: 'stage-token',
    finalize: false,
  });
  assert.deepEqual(matchDriveMutationRoute('DELETE', '/api/files/cleanup-jobs/work/record-id'), {
    kind: 'cleanup-job',
    purpose: 'work',
    id: 'record-id',
  });
  assert.deepEqual(matchDriveMutationRoute('DELETE', '/api/files/cleanup-jobs/record-id'), null);
});

test('avatar routes are purpose-scoped and are not treated as work document ids', () => {
  assert.deepEqual(matchAvatarFileRoute('GET', '/api/files/avatar'), { kind: 'download' });
  assert.deepEqual(matchAvatarFileRoute('GET', '/api/files/avatar/metadata'), { kind: 'metadata' });
  assert.equal(matchAvatarFileRoute('DELETE', '/api/files/avatar'), null);
});

test('work uploads never fall back to people-review authorization', async () => {
  const queries = [];
  const client = {
    async query(queryRef) {
      queries.push(queryRef);
      if (queryRef === uploadApis.work.authorizeFileUpload) throw new Error('WORK_FILE_FORBIDDEN');
      return { userId: 'people-review-user' };
    },
  };

  await assert.rejects(
    authorizeUpload(client, 'work', uploadApis),
    (error) => error.status === 403 && error.code === 'FILE_ACCESS_DENIED',
  );
  assert.deepEqual(queries, [uploadApis.work.authorizeFileUpload]);
  assert.equal(uploadApiForPurpose('work', uploadApis).registerDriveUpload, 'work-register');
  assert.equal(uploadApiForPurpose('work', uploadApis).finalizeStagedUpload, 'work-finalize');
});

test('people-review uploads never fall back to work authorization', async () => {
  const queries = [];
  const client = {
    async query(queryRef) {
      queries.push(queryRef);
      if (queryRef === uploadApis.peopleReview.authorizeFileUpload) {
        throw new Error('PEOPLE_REVIEW_FILE_FORBIDDEN');
      }
      return { userId: 'work-user' };
    },
  };

  await assert.rejects(
    authorizeUpload(client, 'people-review', uploadApis),
    (error) => error.status === 403 && error.code === 'FILE_ACCESS_DENIED',
  );
  assert.deepEqual(queries, [uploadApis.peopleReview.authorizeFileUpload]);
  assert.equal(uploadApiForPurpose('people-review', uploadApis).registerDriveUpload, 'people-review-register');
  assert.equal(uploadApiForPurpose('people-review', uploadApis).finalizeStagedUpload, 'people-review-finalize');
});

test('staged upload capabilities are durable and removable without exposing Drive ids as keys', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvt-stage-test-'));
  const statePath = path.join(directory, 'stages.json');
  const first = new DriveUploadStages(statePath);
  await first.add('capability-token', {
    driveFileId: 'drive-file-id',
    purpose: 'work',
    userId: 'user-1',
  });

  const second = new DriveUploadStages(statePath);
  assert.deepEqual(await second.get('capability-token'), {
    driveFileId: 'drive-file-id',
    purpose: 'work',
    userId: 'user-1',
  });
  assert.equal(await second.get('drive-file-id'), null);
  await second.remove('capability-token');
  assert.equal((await readFile(statePath, 'utf8')).trim(), '{}');
});

test('staged cleanup is object-scoped and propagates Drive failures', async () => {
  const stage = { driveFileId: 'owned-drive-file', userId: 'owner' };
  let deleteCalls = 0;
  assert.throws(
    () => assertStagedUploadOwner(stage, 'other-user'),
    (error) => error.status === 403,
  );
  assert.equal(deleteCalls, 0);

  await settleClaimedUpload({
    claim: { action: 'retain', driveFileId: stage.driveFileId },
    deleteDriveFile: async () => { deleteCalls += 1; },
  });
  assert.equal(deleteCalls, 0, 'an atomic committed decision must retain the Drive file');

  await assert.rejects(
    settleClaimedUpload({
      claim: { action: 'delete', driveFileId: stage.driveFileId },
      deleteDriveFile: async () => { throw new FileHttpError(502, 'DRIVE_DELETE_FAILED'); },
    }),
    (error) => error.status === 502,
  );

  await settleClaimedUpload({
    claim: { action: 'delete', driveFileId: stage.driveFileId },
    deleteDriveFile: async (driveFileId) => {
      assert.equal(driveFileId, stage.driveFileId);
      deleteCalls += 1;
    },
  });
  assert.equal(deleteCalls, 1);
});

test('failed upload cleanup cannot replace the original registration error', async () => {
  const registrationError = new Error('Could not find public function work:registerDriveUpload');
  let cleanupFailure;
  let directDeleteCalls = 0;

  await assert.rejects(
    throwUploadRegistrationError({
      registrationError,
      settleStage: async () => {},
      deleteDriveFile: async () => { directDeleteCalls += 1; },
    }),
    (error) => error.code === 'UPLOAD_REGISTRATION_FAILED' && error.cause === registrationError,
  );
  assert.equal(directDeleteCalls, 0);

  await assert.rejects(
    throwUploadRegistrationError({
      registrationError,
      settleStage: async () => { throw new Error('UPLOAD_NOT_FOUND'); },
      deleteDriveFile: async () => { throw new FileHttpError(502, 'DRIVE_DELETE_FAILED'); },
      onCleanupFailure: (failure) => { cleanupFailure = failure; },
    }),
    (error) => error.code === 'UPLOAD_REGISTRATION_FAILED' && error.cause === registrationError,
  );
  assert.equal(cleanupFailure.stageCleanupError.message, 'UPLOAD_NOT_FOUND');
  assert.equal(cleanupFailure.driveCleanupError.code, 'DRIVE_DELETE_FAILED');
});
