import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import { DriveUploadStages } from './lib/drive-upload-stages.mjs';
import { AsyncSemaphore, DriveFileCache, DRIVE_CACHE_TTL_MS, workFileCacheIdentity, workFileVersion } from './lib/drive-file-cache.mjs';
import { retryDriveDownload } from './lib/drive-download-retry.mjs';
import {
  convexSiteUrl,
  fetchConvexObject,
  isConvexObjectKey,
  storeConvexObject,
} from './lib/convex-file-objects.mjs';
import { downloadContentPolicy } from './lib/file-content-policy.mjs';
import { FileHttpError, classifyFileError } from './lib/file-http-errors.mjs';
import { matchAvatarFileRoute, matchDriveMutationRoute } from './lib/file-route-policy.mjs';
import { staticFrameHeaders } from './lib/static-frame-policy.mjs';
import { wellKnownResponse } from './lib/well-known.mjs';
import {
  buildAuthorizedSharedSchedulePdf,
  parseSharedScheduleQuery,
} from './lib/shared-duty-schedule-pdf.mjs';
import {
  assertStagedUploadOwner,
  settleClaimedUpload,
} from './lib/staged-upload-cleanup.mjs';
import { authorizeUpload, uploadApiForPurpose } from './lib/upload-authorization.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
// Kept outside dist/ so it is never served as a public static file.
const designLibraryFile = path.join(projectRoot, 'design', 'component-library', 'index.html');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3007);
const convexUrl = process.env.CONVEX_URL
  || process.env.CONVEX_SELF_HOSTED_URL
  || 'http://127.0.0.1:3210';
const convexSite = convexSiteUrl(convexUrl, process.env.CONVEX_SITE_URL);
// Legacy Drive objects (uploaded before files moved to Convex Storage) are still read/deleted via gog.
const driveAccount = process.env.LVT_DRIVE_ACCOUNT || 'bemiagent@gmail.com';
const maxFileSize = 20 * 1024 * 1024;
const acceptedExtensions = new Set(['pdf', 'docx', 'xlsx', 'xls', 'png', 'jpg', 'jpeg']);
const execFileAsync = promisify(execFile);
const driveFileCache = new DriveFileCache({
  directory: process.env.LVT_DRIVE_CACHE_PATH || path.join(projectRoot, '.runtime', 'drive-file-cache'),
  ttlMs: Number(process.env.LVT_DRIVE_CACHE_TTL_MS) || DRIVE_CACHE_TTL_MS,
  maxBytes: Number(process.env.LVT_DRIVE_CACHE_MAX_BYTES) || 10 * 1024 ** 3,
});
const driveDownloadSemaphore = new AsyncSemaphore(
  Number(process.env.LVT_DRIVE_DOWNLOAD_CONCURRENCY) || 8,
  Number(process.env.LVT_DRIVE_DOWNLOAD_QUEUE_MAX) || 500,
);
const uploadStages = new DriveUploadStages(
  process.env.LVT_DRIVE_UPLOAD_STATE_PATH
    || path.join(projectRoot, '.runtime', 'drive-upload-stages.json'),
);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function applySecurityHeaders(response) {
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}

function bearerToken(request) {
  const header = String(request.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function safeFileName(request) {
  try {
    const name = decodeURIComponent(String(request.headers['x-file-name'] || '')).trim();
    const extension = name.toLowerCase().split('.').pop() || '';
    if (!name || name.length > 255 || name.includes('/') || name.includes('\\')) return null;
    return acceptedExtensions.has(extension) ? name : null;
  } catch {
    return null;
  }
}

function applyPrivateDownloadHeaders(response, fileName, size, etag, cacheStatus) {
  const policy = downloadContentPolicy(fileName);
  response.setHeader('Cache-Control', 'private, max-age=86400, must-revalidate');
  response.setHeader('Content-Disposition', `${policy.disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  if (Number.isFinite(size)) response.setHeader('Content-Length', size);
  response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  response.setHeader('Content-Type', policy.mimeType);
  response.setHeader('ETag', etag);
  response.setHeader('X-Cache', cacheStatus);
}

async function authorizedClient(request) {
  const token = bearerToken(request);
  if (!token) throw new Error('UNAUTHORIZED');
  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(token);
  return client;
}

function uploadApi(stage, name) {
  return uploadApiForPurpose(stage.purpose)[name];
}

async function deleteDriveFile(driveFileId) {
  if (!driveFileId || !/^[a-zA-Z0-9_-]+$/.test(driveFileId)) {
    throw new FileHttpError(400, 'INVALID_FILE');
  }
  if (isConvexObjectKey(driveFileId)) {
    // Convex deletes the object itself inside the authorized cleanup mutation that follows.
    await driveFileCache.invalidateDriveFile(driveFileId);
    return;
  }
  try {
    await execFileAsync(
      '/opt/homebrew/bin/gog',
      ['drive', 'delete', driveFileId, '--account', driveAccount, '--no-input'],
      { maxBuffer: 1024 * 1024 },
    );
    await driveFileCache.invalidateDriveFile(driveFileId);
  } catch (error) {
    const detail = `${error?.stderr || ''} ${error?.message || ''}`;
    if (/not found|does not exist|404/i.test(detail)) {
      await driveFileCache.invalidateDriveFile(driveFileId);
      return;
    }
    throw new FileHttpError(502, 'DRIVE_DELETE_FAILED', error);
  }
}

async function settleClaimedStage(client, cleanupToken, stage) {
  const claimId = randomUUID();
  const claim = await client.mutation(uploadApi(stage, 'claimStagedUploadCleanup'), {
    cleanupToken,
    claimId,
  });
  try {
    await settleClaimedUpload({ claim, deleteDriveFile });
    if (claim.action === 'delete') {
      await client.mutation(uploadApi(stage, 'completeStagedUploadCleanup'), {
        cleanupToken,
        claimId,
      });
    }
  } catch (error) {
    if (claim.action === 'delete') {
      try {
        await client.mutation(uploadApi(stage, 'releaseStagedUploadCleanup'), {
          cleanupToken,
          claimId,
        });
      } catch (releaseError) {
        console.error('LVT upload cleanup claim release failed', {
          cleanupToken,
          code: releaseError instanceof Error ? releaseError.message : 'UNKNOWN',
        });
      }
    }
    throw error;
  }
}

async function collectStaleUploads(client, actorUserId) {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [cleanupToken, stage] of await uploadStages.entries()) {
    if (stage.userId !== String(actorUserId) || stage.createdAt > cutoff) continue;
    try {
      await settleClaimedStage(client, cleanupToken, stage);
      await uploadStages.remove(cleanupToken);
    } catch (error) {
      console.error('LVT stale upload cleanup failed', {
        cleanupToken,
        code: error instanceof Error ? error.message : 'UNKNOWN',
      });
    }
  }
}

async function handleStagedUpload(request, response, cleanupToken, finalizeOnly) {
  if (!/^[0-9a-f-]{36}$/i.test(cleanupToken)) throw new FileHttpError(400, 'INVALID_UPLOAD');
  const stage = await uploadStages.get(cleanupToken);
  if (!stage) throw new FileHttpError(404, 'FILE_NOT_FOUND');
  const client = await authorizedClient(request);
  const actor = await authorizeUpload(client, stage.purpose);
  assertStagedUploadOwner(stage, actor?.userId);
  if (finalizeOnly) {
    try {
      await client.mutation(uploadApi(stage, 'finalizeStagedUpload'), { cleanupToken });
    } catch (error) {
      if (classifyFileError(error).code !== 'FILE_SERVER_ERROR') throw error;
      throw new FileHttpError(502, 'UPLOAD_FINALIZATION_FAILED', error);
    }
  } else {
    await settleClaimedStage(client, cleanupToken, stage);
  }
  await uploadStages.remove(cleanupToken);
  response.writeHead(204);
  response.end();
}

async function handleCleanupJob(request, response, cleanupJobId, purpose) {
  const client = await authorizedClient(request);
  const api = purpose === 'work' ? anyApi.work : anyApi.peopleReview;
  const job = await client.query(api.authorizeDriveCleanupJob, { cleanupJobId });
  await deleteDriveFile(job.driveFileId);
  await client.mutation(api.completeDriveCleanupJob, { cleanupJobId });
  response.writeHead(204);
  response.end();
}

async function uploadPrivateFile(request, response) {
  const fileName = safeFileName(request);
  const declaredSize = Number(request.headers['content-length'] || 0);
  // Content-Length can be absent when proxies use chunked transfer; allow and count bytes instead.
  if (!fileName) {
    console.error('LVT upload rejected before stream', {
      fileName,
      declaredSize,
      hasNameHeader: Boolean(request.headers['x-file-name']),
    });
    response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end('{"error":"INVALID_FILE"}\n');
    return;
  }
  if (declaredSize > maxFileSize) {
    response.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end('{"error":"FILE_TOO_LARGE"}\n');
    return;
  }

  const client = await authorizedClient(request);
  const purpose = String(request.headers['x-lvt-upload-purpose'] || '').trim() === 'people-review'
    ? 'people-review'
    : 'work';
  const actor = await authorizeUpload(client, purpose);

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'lvt-file-upload-'));
  const temporaryFile = path.join(temporaryDirectory, 'upload.bin');
  const hash = createHash('sha256');
  let received = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      if (received > maxFileSize) {
        callback(new Error('WORK_FILE_TOO_LARGE'));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(request, limiter, createWriteStream(temporaryFile, { mode: 0o600 }));
    if (received <= 0) throw new Error('INVALID_FILE');
    if (declaredSize > 0 && received !== declaredSize) throw new Error('WORK_FILE_SIZE_MISMATCH');
    const driveChecksum = hash.digest('hex');

    // Convex stores the object and registers its staged-upload row (owner = this user) atomically
    // per request; a failed registration discards the object there.
    const uploaded = await storeConvexObject({
      siteUrl: convexSite,
      token: bearerToken(request),
      filePath: temporaryFile,
      fileName,
      purpose,
      checksum: driveChecksum,
    });
    const { cleanupToken } = uploaded;
    const stage = {
      driveFileId: uploaded.driveFileId,
      purpose,
      userId: String(actor?.userId || ''),
      createdAt: Date.now(),
      driveChecksum,
    };
    await uploadStages.add(cleanupToken, stage);
    try {
      await driveFileCache.getOrCreate(
        workFileCacheIdentity({ driveFileId: uploaded.driveFileId, driveChecksum, fileSize: received }),
        (destination) => copyFile(temporaryFile, destination),
      );
    } catch (cacheError) {
      console.error('LVT upload prewarm failed', {
        code: cacheError instanceof Error ? cacheError.message : 'UNKNOWN',
      });
    }

    response.writeHead(201, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(`${JSON.stringify({
      driveFileId: uploaded.driveFileId,
      cleanupToken,
      driveChecksum,
      fileSize: received,
    })}\n`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  // Optional maintenance: never a prerequisite for (or a delay before) the upload itself.
  collectStaleUploads(client, actor?.userId).catch((error) => {
    console.error('LVT stale upload sweep failed', {
      code: error instanceof Error ? error.message : 'UNKNOWN',
    });
  });
}

async function downloadDriveFile(destination, file, requestLabel) {
  await driveDownloadSemaphore.run(() => retryDriveDownload(
    async () => {
      await rm(destination, { force: true });
      await execFileAsync(
        '/opt/homebrew/bin/gog',
        [
          'drive',
          'download',
          file.driveFileId,
          '--account',
          driveAccount,
          '--out',
          destination,
          '--no-input',
        ],
        { maxBuffer: 1024 * 1024, timeout: 90_000 },
      );
    },
    {
      onRetry: (error, attempt) => console.warn('LVT Drive download transient failure; retrying', {
        requestLabel,
        attempt,
        code: error instanceof Error ? error.message.split('\n')[0] : 'UNKNOWN',
      }),
    },
  ));
}

async function downloadLegacyStorageFile(destination, file) {
  if (!file.storageUrl) throw new Error('WORK_FILE_NOT_FOUND');
  const response = await fetch(file.storageUrl);
  if (!response.ok) throw new Error('WORK_FILE_NOT_FOUND');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('EMPTY_FILE');
  await writeFile(destination, bytes);
}

async function serveAuthorizedDriveFile(request, response, file, requestLabel, convexQuery) {
  const sourceIdentity = workFileCacheIdentity(file);
  const entry = await driveFileCache.getOrCreate(
    sourceIdentity,
    (destination) => {
      if (isConvexObjectKey(file.driveFileId)) {
        return fetchConvexObject({
          siteUrl: convexSite,
          token: bearerToken(request),
          query: convexQuery,
          destination,
          expectedChecksum: file.driveChecksum || null,
        });
      }
      return file.driveFileId
        ? downloadDriveFile(destination, file, requestLabel)
        : downloadLegacyStorageFile(destination, file);
    },
  );
  applyPrivateDownloadHeaders(response, file.fileName, entry.size, entry.etag, entry.cacheStatus);
  response.setHeader('Vary', 'Authorization');
  if (request.headers['if-none-match'] === entry.etag) {
    response.removeHeader('Content-Length');
    response.writeHead(304);
    response.end();
    return;
  }
  response.writeHead(200);
  await pipeline(createReadStream(entry.path), response);
}

async function downloadPeopleReviewFile(request, response, kind, fileId) {
  const client = await authorizedClient(request);
  const file = await client.query(anyApi.peopleReview.authorizeFileDownload, { kind, fileId });
  await serveAuthorizedDriveFile(request, response, file, `people-review:${kind}:${fileId}`, {
    purpose: 'people-review',
    kind,
    fileId,
  });
}

async function workFileMetadata(request, response, documentId) {
  const client = await authorizedClient(request);
  const file = await client.query(anyApi.work.authorizeFileDownload, { documentId });
  response.writeHead(200, {
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify({
    fileName: file.fileName,
    fileSize: file.fileSize,
    fileVersion: workFileVersion(file),
  })}\n`);
}

async function downloadFromDrive(request, response, documentId) {
  const client = await authorizedClient(request);
  const file = await client.query(anyApi.work.authorizeFileDownload, { documentId });
  await serveAuthorizedDriveFile(request, response, file, `work:${documentId}`, {
    purpose: 'work',
    documentId,
  });
}

async function avatarFileMetadata(request, response) {
  const client = await authorizedClient(request);
  const file = await client.query(anyApi.userAvatar.authorizeAvatarDownload, {});
  response.writeHead(200, {
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify({
    fileName: file.fileName,
    fileSize: file.fileSize,
    fileVersion: file.fileVersion,
  })}\n`);
}

async function downloadAvatar(request, response) {
  const client = await authorizedClient(request);
  const file = await client.query(anyApi.userAvatar.authorizeAvatarDownload, {});
  if (!file.storageUrl) throw new Error('AVATAR_NOT_FOUND');
  const etag = `"${String(file.fileVersion || file.fileSize)}"`;
  if (request.headers['if-none-match'] === etag) {
    applyPrivateDownloadHeaders(response, file.fileName, file.fileSize, etag, 'REVALIDATED');
    response.removeHeader('Content-Length');
    response.writeHead(304);
    response.end();
    return;
  }
  const upstream = await fetch(file.storageUrl);
  if (!upstream.ok) throw new Error('AVATAR_NOT_FOUND');
  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (!bytes.length) throw new Error('AVATAR_NOT_FOUND');
  applyPrivateDownloadHeaders(response, file.fileName, bytes.length, etag, 'MISS');
  response.writeHead(200);
  response.end(bytes);
}

async function downloadSharedDutySchedulePdf(request, response) {
  const url = new URL(request.url || '/', 'http://localhost');
  const { mode, anchor } = parseSharedScheduleQuery(url.searchParams);
  const client = await authorizedClient(request);
  const built = await buildAuthorizedSharedSchedulePdf(client, mode, anchor);
  const bytes = Buffer.from(built.bytes);
  const fileName = built.filename || 'LCT.pdf';
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader(
    'Content-Disposition',
    `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  );
  response.setHeader('Content-Length', bytes.length);
  response.setHeader('Vary', 'Authorization');
  response.writeHead(200);
  response.end(bytes);
}

async function serveDesignLibrary(request, response) {
  const client = await authorizedClient(request);
  try {
    await client.query(anyApi.designLibrary.authorizeView, {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ACCOUNT_LOCKED|USER_NOT_ACTIVE|PASSWORD_CHANGE_REQUIRED/.test(message)) {
      throw new FileHttpError(403, 'FILE_ACCESS_DENIED', error);
    }
    throw error;
  }
  const html = await readFile(designLibraryFile);
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Content-Length', html.length);
  response.setHeader('Vary', 'Authorization');
  response.writeHead(200);
  response.end(html);
}

async function existingFile(candidate) {
  try {
    const metadata = await stat(candidate);
    return metadata.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  try {
    applySecurityHeaders(response);

    if (request.url === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end('{"status":"ok"}\n');
      return;
    }

    if (request.method === 'POST' && request.url === '/api/files/upload') {
      await uploadPrivateFile(request, response);
      return;
    }

    const driveMutation = matchDriveMutationRoute(request.method, request.url);
    if (driveMutation?.kind === 'staged-upload') {
      await handleStagedUpload(request, response, driveMutation.id, driveMutation.finalize);
      return;
    }
    if (driveMutation?.kind === 'cleanup-job') {
      await handleCleanupJob(request, response, driveMutation.id, driveMutation.purpose);
      return;
    }

    const peopleReviewDownload = request.method === 'GET'
      ? new URL(request.url || '/', 'http://localhost').pathname.match(/^\/api\/people-review\/files\/(fault|evaluation)\/([^/]+)$/)
      : null;
    if (peopleReviewDownload) {
      await downloadPeopleReviewFile(request, response, peopleReviewDownload[1], peopleReviewDownload[2]);
      return;
    }

    const privatePath = request.method === 'GET'
      ? new URL(request.url || '/', 'http://localhost').pathname
      : '';
    const avatarRoute = matchAvatarFileRoute(request.method, request.url);
    if (avatarRoute?.kind === 'metadata') {
      await avatarFileMetadata(request, response);
      return;
    }
    if (avatarRoute?.kind === 'download') {
      await downloadAvatar(request, response);
      return;
    }
    const privateMetadata = privatePath.match(/^\/api\/files\/([^/]+)\/metadata$/);
    if (privateMetadata) {
      await workFileMetadata(request, response, privateMetadata[1]);
      return;
    }
    const privateDownload = privatePath.match(/^\/api\/files\/([^/]+)$/);
    if (privateDownload) {
      await downloadFromDrive(request, response, privateDownload[1]);
      return;
    }

    if (request.method === 'GET' && privatePath === '/api/design-library') {
      await serveDesignLibrary(request, response);
      return;
    }

    if (request.method === 'GET' && privatePath === '/api/duties/shared-schedule.pdf') {
      await downloadSharedDutySchedulePdf(request, response);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'DELETE' && request.method !== 'POST') {
      response.writeHead(405, { Allow: 'GET, HEAD, POST, DELETE' });
      response.end();
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    const wellKnown = request.method === 'GET' || request.method === 'HEAD' ? wellKnownResponse(pathname) : null;
    if (wellKnown) {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : wellKnown);
      return;
    }
    if (pathname.startsWith('/api/')) {
      response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end('{"error":"FILE_NOT_FOUND"}\n');
      return;
    }

    const candidate = path.resolve(distRoot, `.${pathname}`);
    const isInsideDist = candidate === distRoot || candidate.startsWith(`${distRoot}${path.sep}`);
    if (!isInsideDist) {
      response.writeHead(403);
      response.end();
      return;
    }

    const filePath = (await existingFile(candidate)) || path.join(distRoot, 'index.html');
    const extension = path.extname(filePath).toLowerCase();
    const isHashedAsset = filePath.startsWith(`${path.join(distRoot, 'assets')}${path.sep}`);

    response.setHeader('Content-Type', contentTypes.get(extension) || 'application/octet-stream');
    const servedPath = `/${path.relative(distRoot, filePath).split(path.sep).join('/')}`;
    for (const header of staticFrameHeaders(servedPath)) response.setHeader(header.name, header.value);
    response.setHeader(
      'Cache-Control',
      isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    );

    if (request.method === 'HEAD') {
      response.writeHead(200);
      response.end();
      return;
    }

    createReadStream(filePath)
      .on('error', () => {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      })
      .pipe(response);
  } catch (error) {
    const classified = classifyFileError(error);
    console.error('LVT private file request failed', {
      method: request.method,
      path: request.url,
      code: classified.code,
      cause: error?.cause instanceof Error
        ? error.cause.message
        : (error instanceof Error ? error.message : 'UNKNOWN'),
    });
    if (!response.headersSent) {
      response.writeHead(classified.status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(`${JSON.stringify({ error: classified.code })}\n`);
    } else {
      response.end();
    }
  }
});

driveFileCache.prune().catch((error) => {
  console.error('LVT Drive cache startup prune failed', {
    code: error instanceof Error ? error.message : 'UNKNOWN',
  });
});

server.listen(port, host, () => {
  console.log(`LVT CRM production frontend listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
