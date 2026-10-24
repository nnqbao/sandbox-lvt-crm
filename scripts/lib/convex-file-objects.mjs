import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { FileHttpError } from './file-http-errors.mjs';

/**
 * Private work / people-review files are stored in Convex File Storage. Records keep the column
 * `driveFileId` as an opaque object key: `cvx_<storageId>` for Convex objects, anything else is a
 * legacy Google Drive id (see convex/fileObjects.ts). The gateway moves bytes through the Convex
 * HTTP routes in convex/fileHttp.ts with the user's own bearer token, so Convex re-authorizes
 * every transfer and no storage URL is ever minted.
 */
export const CONVEX_OBJECT_PREFIX = 'cvx_';
const TRANSFER_TIMEOUT_MS = 90_000;

export function isConvexObjectKey(key) {
  return /^cvx_[a-zA-Z0-9]+$/.test(String(key || ''));
}

/** HTTP-actions origin of the deployment (`*.convex.cloud` → `*.convex.site`). */
export function convexSiteUrl(convexUrl, override = '') {
  if (override) return String(override).replace(/\/+$/, '');
  const url = new URL(convexUrl);
  if (!url.hostname.endsWith('.convex.cloud')) throw new Error('CONVEX_SITE_URL_REQUIRED');
  url.hostname = url.hostname.replace(/\.convex\.cloud$/, '.convex.site');
  return url.origin;
}

async function transferError(response, fallbackCode) {
  const body = await response.json().catch(() => null);
  const code = typeof body?.error === 'string' ? body.error : fallbackCode;
  const status = response.status >= 400 && response.status < 500 ? response.status : 502;
  return new FileHttpError(status, code);
}

export async function storeConvexObject({
  siteUrl,
  token,
  filePath,
  fileName,
  purpose,
  checksum,
  fetchImpl = fetch,
}) {
  const bytes = await readFile(filePath);
  let response;
  try {
    response = await fetchImpl(`${siteUrl}/lvt-files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(fileName),
        'X-LVT-Upload-Purpose': purpose,
        'X-LVT-Checksum': checksum,
      },
      body: bytes,
      signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
    });
  } catch (error) {
    throw new FileHttpError(503, 'FILE_TEMPORARILY_UNAVAILABLE', error);
  }
  if (!response.ok) throw await transferError(response, 'UPLOAD_REGISTRATION_FAILED');
  const uploaded = await response.json().catch(() => null);
  if (
    !isConvexObjectKey(uploaded?.driveFileId)
    || !/^[0-9a-f-]{36}$/i.test(String(uploaded?.cleanupToken || ''))
    || uploaded?.driveChecksum !== checksum
    || uploaded?.fileSize !== bytes.length
  ) {
    throw new FileHttpError(502, 'UPLOAD_REGISTRATION_FAILED');
  }
  return uploaded;
}

/** Downloads an authorized object into `destination`; rejects empty or checksum-mismatched bytes. */
export async function fetchConvexObject({
  siteUrl,
  token,
  query,
  destination,
  expectedChecksum,
  fetchImpl = fetch,
}) {
  let response;
  try {
    response = await fetchImpl(`${siteUrl}/lvt-files/object?${new URLSearchParams(query)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS),
    });
  } catch (error) {
    throw new FileHttpError(503, 'FILE_TEMPORARILY_UNAVAILABLE', error);
  }
  if (!response.ok) throw await transferError(response, 'FILE_SERVER_ERROR');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error('EMPTY_FILE');
  if (expectedChecksum && createHash('sha256').update(bytes).digest('hex') !== expectedChecksum) {
    throw new FileHttpError(502, 'FILE_CHECKSUM_MISMATCH');
  }
  await writeFile(destination, bytes, { mode: 0o600 });
}
