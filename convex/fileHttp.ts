/**
 * Private file transfer for the LVT file gateway (scripts/serve-production.mjs).
 * The gateway forwards the signed-in user's bearer token; every request re-runs the same
 * authorization queries/mutations as the rest of the app, inside Convex. No storage URL is
 * ever created or returned, so clients only reach file bytes through `/api/files/...`.
 */
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, internalQuery } from "./_generated/server";
import {
  MAX_PRIVATE_FILE_BYTES,
  acceptedUploadFileName,
  canonicalPrivateFileMime,
  convexObjectKey,
  fileErrorStatus,
  sha256Hex,
  storageIdFromObjectKey,
} from "./fileObjects";

function json(status: number, body: Record<string, unknown>) {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function failure(error: unknown) {
  const { status, code } = fileErrorStatus(error);
  return json(status, { error: code });
}

export const storedObject = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => await ctx.db.system.get("_storage", args.storageId),
});

/**
 * POST /lvt-files/upload — body: the raw file; headers: X-File-Name (URI-encoded),
 * X-LVT-Upload-Purpose (work | people-review), optional X-LVT-Checksum (hex SHA-256).
 * Stores the object and registers its staged-upload row for the caller in one request.
 */
export const uploadPrivateFile = httpAction(async (ctx, request) => {
  const purpose = request.headers.get("X-LVT-Upload-Purpose") === "people-review" ? "people-review" : "work";
  const moduleApi: any = purpose === "work" ? api.work : api.peopleReview;
  const fileName = acceptedUploadFileName(request.headers.get("X-File-Name"));
  if (!fileName) return json(400, { error: "INVALID_FILE" });
  if (Number(request.headers.get("Content-Length") || 0) > MAX_PRIVATE_FILE_BYTES) {
    return json(413, { error: "FILE_TOO_LARGE" });
  }
  try {
    await ctx.runQuery(moduleApi.authorizeFileUpload, {});
  } catch (error) {
    return failure(error);
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength <= 0) return json(400, { error: "INVALID_FILE" });
  if (bytes.byteLength > MAX_PRIVATE_FILE_BYTES) return json(413, { error: "FILE_TOO_LARGE" });
  const storageId = await ctx.storage.store(new Blob([bytes], { type: canonicalPrivateFileMime(fileName) }));
  const discard = async () => {
    await ctx.storage.delete(storageId).catch(() => {});
  };

  const stored: any = await ctx.runQuery(internal.fileHttp.storedObject, { storageId });
  const checksum = sha256Hex(stored?.sha256);
  const expected = String(request.headers.get("X-LVT-Checksum") || "").trim().toLowerCase();
  if (!stored || !checksum || Number(stored.size) !== bytes.byteLength || (expected && expected !== checksum)) {
    await discard();
    return json(400, { error: "INVALID_FILE" });
  }

  const cleanupToken = crypto.randomUUID();
  const key = convexObjectKey(storageId);
  try {
    await ctx.runMutation(moduleApi.registerDriveUpload, { cleanupToken, driveFileId: key });
  } catch (error) {
    await discard();
    const failed = fileErrorStatus(error);
    return failed.status === 500
      ? json(502, { error: "UPLOAD_REGISTRATION_FAILED" })
      : json(failed.status, { error: failed.code });
  }
  return json(201, { driveFileId: key, cleanupToken, driveChecksum: checksum, fileSize: bytes.byteLength });
});

/**
 * GET /lvt-files/object?purpose=work&documentId=… | ?purpose=people-review&kind=fault|evaluation&fileId=…
 * Re-authorizes the caller for that record, then streams its Convex Storage object.
 */
export const downloadPrivateFile = httpAction(async (ctx, request) => {
  const params = new URL(request.url).searchParams;
  const purpose = params.get("purpose");
  let file: any;
  try {
    if (purpose === "work") {
      file = await ctx.runQuery(api.work.authorizeFileDownload, {
        documentId: String(params.get("documentId") || "") as Id<"officeDocuments">,
      });
    } else if (purpose === "people-review") {
      const kind = params.get("kind");
      if (kind !== "fault" && kind !== "evaluation") return json(400, { error: "INVALID_FILE" });
      file = await ctx.runQuery(api.peopleReview.authorizeFileDownload, {
        kind,
        fileId: String(params.get("fileId") || ""),
      });
    } else {
      return json(400, { error: "INVALID_FILE" });
    }
  } catch (error) {
    return failure(error);
  }
  const storageId = storageIdFromObjectKey(file?.driveFileId);
  if (!storageId) return json(404, { error: "FILE_NOT_FOUND" });
  const blob = await ctx.storage.get(storageId as Id<"_storage">);
  if (!blob || blob.size <= 0) return json(404, { error: "FILE_NOT_FOUND" });
  return new Response(blob, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(blob.size),
      "Content-Type": "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
