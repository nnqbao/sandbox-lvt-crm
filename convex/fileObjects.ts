/**
 * Private work / people-review files live in Convex File Storage (since 2026-10).
 *
 * Records keep the historical column name `driveFileId` as an opaque *object key*, so the
 * staged-upload, cleanup-job and `by_drive_file` machinery stays unchanged:
 * - `cvx_<storageId>`: a Convex Storage object (every new upload);
 * - anything else: a legacy Google Drive object, still served/deleted through `gog`.
 * Records with the older `fileId` column (Convex Storage before Drive) keep their own path.
 * Pure helpers only: tests load this file directly.
 */

export const CONVEX_OBJECT_PREFIX = "cvx_";
export const MAX_PRIVATE_FILE_BYTES = 20 * 1024 * 1024;
/** A freshly stored object must be registered quickly; older objects can't be claimed. */
export const UPLOAD_REGISTRATION_WINDOW_MS = 10 * 60 * 1000;
export const PRIVATE_FILE_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "xls", "png", "jpg", "jpeg"]);

export function convexObjectKey(storageId: string): string {
  const id = String(storageId || "");
  if (!/^[a-zA-Z0-9]+$/.test(id)) throw new Error("INVALID_UPLOAD");
  return `${CONVEX_OBJECT_PREFIX}${id}`;
}

/** Storage id of a `cvx_` key, or null for a legacy Drive id / malformed value. */
export function storageIdFromObjectKey(key: unknown): string | null {
  const value = String(key ?? "");
  if (!value.startsWith(CONVEX_OBJECT_PREFIX)) return null;
  const id = value.slice(CONVEX_OBJECT_PREFIX.length);
  return /^[a-zA-Z0-9]+$/.test(id) ? id : null;
}

export function storageProviderForKey(key: string | undefined | null): "convex" | "google_drive" {
  return storageIdFromObjectKey(key) ? "convex" : "google_drive";
}

/** File name as sent in `X-File-Name` (URI-encoded); null when unusable. */
export function acceptedUploadFileName(encoded: unknown): string | null {
  let name: string;
  try {
    name = decodeURIComponent(String(encoded ?? "")).trim();
  } catch {
    return null;
  }
  if (!name || name.length > 255 || name.includes("/") || name.includes("\\")) return null;
  const extension = name.toLowerCase().split(".").pop() || "";
  return PRIVATE_FILE_EXTENSIONS.has(extension) ? name : null;
}

/**
 * A `cvx_` key may be registered as an upload stage only for a non-empty, in-limit object that
 * was stored moments ago and that no other stage already owns.
 */
export function storedObjectRegistrable(
  object: { size?: number; _creationTime?: number } | null | undefined,
  now: number,
  alreadyStaged: boolean,
): boolean {
  if (!object || alreadyStaged) return false;
  const size = Number(object.size || 0);
  if (size <= 0 || size > MAX_PRIVATE_FILE_BYTES) return false;
  return now - Number(object._creationTime || 0) <= UPLOAD_REGISTRATION_WINDOW_MS;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** MIME derived from the validated name, never from the client's Content-Type claim. */
export function canonicalPrivateFileMime(fileName: string): string {
  return MIME_BY_EXTENSION[String(fileName).toLowerCase().split(".").pop() || ""] || "application/octet-stream";
}

/** `_storage.sha256` as lowercase hex (Convex documents base16; older deployments used base64). */
export function sha256Hex(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (/^[0-9a-f]{64}$/i.test(raw)) return raw.toLowerCase();
  try {
    const binary = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    if (binary.length !== 32) return null;
    let hex = "";
    for (let i = 0; i < binary.length; i += 1) hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
    return hex;
  } catch {
    return null;
  }
}

/** HTTP status + stable code for an error thrown by an authorization query/mutation. */
export function fileErrorStatus(error: unknown): { status: number; code: string } {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/FORBIDDEN|ACCESS_DENIED|ACCOUNT_LOCKED|USER_NOT_ACTIVE|PASSWORD_CHANGE_REQUIRED/i.test(message)) {
    return { status: 403, code: "FILE_ACCESS_DENIED" };
  }
  if (/NOT_FOUND/i.test(message)) return { status: 404, code: "FILE_NOT_FOUND" };
  if (/Unauthenticated|UNAUTHORIZED|AUTH_REQUIRED|NOT_AUTHENTICATED/i.test(message)) {
    return { status: 401, code: "UNAUTHORIZED" };
  }
  if (/ArgumentValidation|Invalid argument|INVALID_/i.test(message)) return { status: 400, code: "INVALID_FILE" };
  return { status: 500, code: "FILE_SERVER_ERROR" };
}
