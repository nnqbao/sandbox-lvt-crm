import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  MAX_PRIVATE_FILE_BYTES,
  UPLOAD_REGISTRATION_WINDOW_MS,
  acceptedUploadFileName,
  canonicalPrivateFileMime,
  convexObjectKey,
  fileErrorStatus,
  sha256Hex,
  storageIdFromObjectKey,
  storageProviderForKey,
  storedObjectRegistrable,
} from '../convex/fileObjects.ts';
import {
  convexSiteUrl,
  isConvexObjectKey,
  readConvexObject,
  storeConvexObject,
} from '../scripts/lib/convex-file-objects.mjs';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('object keys separate Convex Storage objects from legacy Drive ids', () => {
  assert.equal(convexObjectKey('kg2abc123'), 'cvx_kg2abc123');
  assert.equal(storageIdFromObjectKey('cvx_kg2abc123'), 'kg2abc123');
  assert.equal(storageIdFromObjectKey('1NNqX7OCsuyKazkwX92-xE9ycUC6NOcaU'), null);
  assert.equal(storageIdFromObjectKey('cvx_../x'), null);
  assert.equal(storageProviderForKey('cvx_kg2abc123'), 'convex');
  assert.equal(storageProviderForKey('1NNqX7OCsuyKazkwX92'), 'google_drive');
  assert.throws(() => convexObjectKey('../x'), /INVALID_UPLOAD/);
  // Keys still satisfy the stage/cleanup id pattern used everywhere else.
  assert.match(convexObjectKey('kg2abc123'), /^[a-zA-Z0-9_-]+$/);
  assert.equal(isConvexObjectKey('cvx_kg2abc123'), true);
  assert.equal(isConvexObjectKey('1NNqX7OCsuyKazkwX92'), false);
});

test('only a fresh, in-limit, unclaimed stored object can be staged', () => {
  const now = 1_000_000_000;
  const fresh = { size: 1024, _creationTime: now - 1000 };
  assert.equal(storedObjectRegistrable(fresh, now, false), true);
  assert.equal(storedObjectRegistrable(fresh, now, true), false, 'already owned by another stage');
  assert.equal(storedObjectRegistrable(null, now, false), false);
  assert.equal(storedObjectRegistrable({ size: 0, _creationTime: now }, now, false), false);
  assert.equal(storedObjectRegistrable({ size: MAX_PRIVATE_FILE_BYTES + 1, _creationTime: now }, now, false), false);
  assert.equal(
    storedObjectRegistrable({ size: 10, _creationTime: now - UPLOAD_REGISTRATION_WINDOW_MS - 1 }, now, false),
    false,
    'an old object (someone else\'s record) cannot be adopted',
  );
});

test('upload names, MIME and checksums are derived server-side', () => {
  assert.equal(acceptedUploadFileName(encodeURIComponent('26-10043 công văn.pdf')), '26-10043 công văn.pdf');
  assert.equal(acceptedUploadFileName('payload.html'), null);
  assert.equal(acceptedUploadFileName(encodeURIComponent('../a.pdf')), null);
  assert.equal(acceptedUploadFileName('%E0%A4%A'), null);
  assert.equal(canonicalPrivateFileMime('a.PDF'), 'application/pdf');
  assert.equal(canonicalPrivateFileMime('a.exe'), 'application/octet-stream');
  const hex = sha('abc');
  assert.equal(sha256Hex(hex.toUpperCase()), hex);
  assert.equal(sha256Hex(Buffer.from(hex, 'hex').toString('base64')), hex);
  assert.equal(sha256Hex('nope'), null);
});

test('authorization failures keep truthful statuses', () => {
  assert.deepEqual(fileErrorStatus(new Error('WORK_FILE_FORBIDDEN')), { status: 403, code: 'FILE_ACCESS_DENIED' });
  assert.deepEqual(fileErrorStatus(new Error('ACCOUNT_LOCKED')), { status: 403, code: 'FILE_ACCESS_DENIED' });
  assert.deepEqual(fileErrorStatus(new Error('UNAUTHENTICATED')), { status: 401, code: 'UNAUTHORIZED' });
  assert.deepEqual(fileErrorStatus(new Error('WORK_FILE_NOT_FOUND')), { status: 404, code: 'FILE_NOT_FOUND' });
  assert.deepEqual(fileErrorStatus(new Error('INVALID_UPLOAD')), { status: 400, code: 'INVALID_FILE' });
  assert.deepEqual(fileErrorStatus(new Error('boom')), { status: 500, code: 'FILE_SERVER_ERROR' });
});

test('gateway derives the HTTP-actions origin of the deployment', () => {
  assert.equal(convexSiteUrl('https://decisive-puma-318.convex.cloud'), 'https://decisive-puma-318.convex.site');
  assert.equal(convexSiteUrl('http://127.0.0.1:3210', 'http://127.0.0.1:3211/'), 'http://127.0.0.1:3211');
  assert.throws(() => convexSiteUrl('http://127.0.0.1:3210'), /CONVEX_SITE_URL_REQUIRED/);
});

test('gateway stores through Convex with the user token and verifies the receipt', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lvt-cvx-'));
  const filePath = path.join(directory, 'upload.bin');
  const bytes = Buffer.from('%PDF-1.7 test');
  await writeFile(filePath, bytes);
  const checksum = sha(bytes);
  const calls = [];
  const receipt = {
    driveFileId: 'cvx_kg2abc',
    cleanupToken: '0f8fad5b-d9cb-469f-a165-70867728950e',
    driveChecksum: checksum,
    fileSize: bytes.length,
  };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(receipt), { status: 201 });
  };
  const uploaded = await storeConvexObject({
    siteUrl: 'https://x.convex.site', token: 'tok', filePath, fileName: 'công văn.pdf', purpose: 'work', checksum, fetchImpl,
  });
  assert.deepEqual(uploaded, receipt);
  assert.equal(calls[0].url, 'https://x.convex.site/lvt-files/upload');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].init.headers['X-LVT-Upload-Purpose'], 'work');
  assert.equal(calls[0].init.headers['X-LVT-Checksum'], checksum);

  await assert.rejects(
    storeConvexObject({
      siteUrl: 'https://x.convex.site', token: 'tok', filePath, fileName: 'a.pdf', purpose: 'work', checksum,
      fetchImpl: async () => new Response(JSON.stringify({ ...receipt, driveChecksum: sha('other') }), { status: 201 }),
    }),
    (error) => error.code === 'UPLOAD_REGISTRATION_FAILED',
  );
  await assert.rejects(
    storeConvexObject({
      siteUrl: 'https://x.convex.site', token: 'tok', filePath, fileName: 'a.pdf', purpose: 'work', checksum,
      fetchImpl: async () => new Response('{"error":"FILE_ACCESS_DENIED"}', { status: 403 }),
    }),
    (error) => error.status === 403 && error.code === 'FILE_ACCESS_DENIED',
  );
  await assert.rejects(
    storeConvexObject({
      siteUrl: 'https://x.convex.site', token: 'tok', filePath, fileName: 'a.pdf', purpose: 'work', checksum,
      fetchImpl: async () => { throw new Error('ECONNRESET'); },
    }),
    (error) => error.status === 503,
  );
});

test('gateway downloads re-authorize in Convex and reject empty or tampered bytes', async () => {
  const bytes = Buffer.from('hello');
  let seen;
  const got = await readConvexObject({
    siteUrl: 'https://x.convex.site',
    token: 'tok',
    query: { purpose: 'work', documentId: 'doc1' },
    expectedChecksum: sha(bytes),
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return new Response(bytes, { status: 200 });
    },
  });
  assert.equal(seen.url, 'https://x.convex.site/lvt-files/object?purpose=work&documentId=doc1');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.equal(got.toString(), 'hello');

  const base = { siteUrl: 'https://x.convex.site', token: 'tok', query: { purpose: 'work', documentId: 'd' } };
  await assert.rejects(
    readConvexObject({ ...base, expectedChecksum: sha('other'), fetchImpl: async () => new Response(bytes) }),
    (error) => error.code === 'FILE_CHECKSUM_MISMATCH',
  );
  await assert.rejects(
    readConvexObject({ ...base, fetchImpl: async () => new Response('') }),
    /EMPTY_FILE/,
  );
  await assert.rejects(
    readConvexObject({ ...base,
      fetchImpl: async () => new Response('{"error":"FILE_ACCESS_DENIED"}', { status: 403 }) }),
    (error) => error.status === 403,
  );
});

test('Convex-stored files never touch the gateway disk', async () => {
  const server = await read('scripts/serve-production.mjs');
  const serve = server.slice(server.indexOf('async function serveAuthorizedDriveFile('), server.indexOf('async function downloadPeopleReviewFile('));
  const memoryPath = serve.slice(0, serve.indexOf('const entry = await driveFileCache.getOrCreate('));
  assert.match(memoryPath, /if \(!file\.driveFileId \|\| isConvexObjectKey\(file\.driveFileId\)\)/);
  assert.match(memoryPath, /readConvexObject\(/);
  assert.match(memoryPath, /readLegacyStorageFile\(file\)/);
  assert.match(memoryPath, /return;\n  \}\n  $/, 'Convex path returns before the disk cache');
  assert.doesNotMatch(server, /copyFile|writeFile/, 'no upload prewarm or legacy download to disk');
});

test('new uploads go to Convex Storage, never to Drive or a storage URL', async () => {
  const server = await read('scripts/serve-production.mjs');
  assert.doesNotMatch(server, /'drive',\s*'upload'/, 'the upload request path no longer calls gog drive upload');
  assert.match(server, /storeConvexObject\(/);
  assert.match(server, /collectStaleUploads\(client, actor\?\.userId\)\.catch/, 'stale sweep runs after the response');

  const http = await read('convex/http.ts');
  assert.match(http, /path: "\/lvt-files\/upload", method: "POST"/);
  assert.match(http, /path: "\/lvt-files\/object", method: "GET"/);

  const fileHttp = await read('convex/fileHttp.ts');
  assert.doesNotMatch(fileHttp, /getUrl\(/, 'no storage URL is minted for new files');
  assert.match(fileHttp, /authorizeFileUpload/);
  assert.match(fileHttp, /api\.work\.authorizeFileDownload/);
  assert.match(fileHttp, /api\.peopleReview\.authorizeFileDownload/);

  const stages = await read('convex/driveUploadStages.ts');
  assert.match(stages, /storedObjectRegistrable/);
  assert.match(stages, /await deleteConvexObject\(ctx, stage\.driveFileId\);/);
  const work = await read('convex/work.ts');
  assert.match(work, /await deleteConvexObject\(ctx, job\.driveFileId\);/);
  const peopleReview = await read('convex/peopleReview.ts');
  assert.match(peopleReview, /await deleteConvexObject\(ctx, job\.driveFileId\);/);
});
