import { anyApi } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { authUserIdOrThrow } from "./lib";
import { assertImportUploadUsable } from "./userImportPolicy";
import { insertCreatedDuty, requireDutyWrite } from "./duties";
import { cleanDutyInput, evaluateDutyRefs } from "./dutyWritePolicy";
import {
  DUTY_IMPORT_MAX_BYTES,
  DUTY_IMPORT_TTL_MS,
  type DutySheetRow,
} from "./dutyImportSheet";
import {
  DUTY_IMPORT_MESSAGES,
  validateDutyImportRows,
  type DutyImportError,
  type DutyImportPreviewRow,
} from "./dutyImportValidate";

const internal = anyApi;

const previewRowValidator = v.object({
  rowNumber: v.number(),
  title: v.string(),
  content: v.string(),
  locationText: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  startTime: v.string(),
  endTime: v.string(),
  allDay: v.boolean(),
  departmentIds: v.array(v.string()),
  departmentCodes: v.array(v.string()),
  departmentNames: v.array(v.string()),
  participantUserIds: v.array(v.string()),
  participantEmails: v.array(v.string()),
  participantNames: v.array(v.string()),
  otherParticipants: v.string(),
});

function parseFailureMessage(code: string | null) {
  if (code === "INVALID_IMPORT_HEADERS") return DUTY_IMPORT_MESSAGES.invalidHeaders;
  if (code === "IMPORT_FILE_EMPTY") return DUTY_IMPORT_MESSAGES.emptyFile;
  if (code === "IMPORT_FILE_TOO_LARGE") return "File vượt quá giới hạn 2 MB.";
  return "Không đọc được file import từ server.";
}

export const getUploadInternal = internalQuery({
  args: { uploadId: v.id("dutyImportUploads") },
  handler: async (ctx, args) => await ctx.db.get(args.uploadId),
});

export const listValidationContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const actor = await requireDutyWrite(ctx);
    const [departments, users] = await Promise.all([
      ctx.db.query("departments").collect(),
      ctx.db.query("users").collect(),
    ]);
    return {
      actor: {
        user: {
          _id: String(actor.user._id),
          departmentId: actor.user.departmentId,
          positionId: actor.user.positionId,
        },
        isOps: actor.isOps,
        positions: actor.positions.map((row: { _id: string; level: number; active: boolean }) => ({
          _id: String(row._id),
          level: row.level,
          active: row.active,
        })),
      },
      departments: departments.map((row) => ({
        _id: String(row._id),
        name: row.name,
        code: row.code,
        active: row.active,
      })),
      users: users.map((row) => ({
        _id: String(row._id),
        name: row.name,
        email: row.email,
        status: row.status,
        departmentId: row.departmentId,
        positionId: row.positionId,
      })),
    };
  },
});

export const claimUploadForCommit = internalMutation({
  args: { uploadId: v.id("dutyImportUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    if (upload.status === "committed") throw new Error("IMPORT_UPLOAD_ALREADY_COMMITTED");
    if (upload.status === "committing") throw new Error("IMPORT_UPLOAD_IN_PROGRESS");
    if (upload.status === "expired" || Date.now() > upload.expiresAt) {
      throw new Error("IMPORT_UPLOAD_EXPIRED");
    }
    await ctx.db.patch(args.uploadId, { status: "committing" });
  },
});

export const releaseUploadClaim = internalMutation({
  args: { uploadId: v.id("dutyImportUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.status !== "committing") return;
    await ctx.db.patch(args.uploadId, { status: "uploaded" });
  },
});

export const commitValidatedInternal = internalMutation({
  args: {
    uploadId: v.id("dutyImportUploads"),
    rows: v.array(previewRowValidator),
  },
  handler: async (ctx, args) => {
    const actor = await requireDutyWrite(ctx);
    const upload = await ctx.db.get(args.uploadId);
    if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
    if (String(upload.uploadedBy) !== String(actor.user._id)) throw new Error("FORBIDDEN");
    if (upload.status !== "committing") throw new Error("IMPORT_UPLOAD_IN_PROGRESS");

    const [departments, users] = await Promise.all([
      ctx.db.query("departments").collect(),
      ctx.db.query("users").collect(),
    ]);
    const created: { id: string; title: string }[] = [];
    for (const row of args.rows) {
      const input = cleanDutyInput({
        startDate: row.startDate,
        endDate: row.endDate,
        startTime: row.startTime,
        endTime: row.endTime,
        allDay: row.allDay,
        title: row.title,
        content: row.content,
        locationText: row.locationText,
        departmentIds: row.departmentIds,
        participantUserIds: row.participantUserIds,
        otherParticipants: row.otherParticipants,
      });
      const refError = evaluateDutyRefs(input, actor, { departments, users });
      if (refError) throw new Error(refError);
      const id = await insertCreatedDuty(ctx, actor, input, "import");
      created.push({ id: String(id), title: input.title });
    }

    const now = Date.now();
    await ctx.db.patch(args.uploadId, {
      status: "committed",
      rowCount: created.length,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "duty.import_commit",
      details: JSON.stringify({ uploadId: args.uploadId, count: created.length }),
      at: now,
    });
    return { createdCount: created.length, duties: created };
  },
});

export const purgeImportUpload = internalMutation({
  args: { uploadId: v.id("dutyImportUploads") },
  handler: async (ctx, args) => {
    const upload = await ctx.db.get(args.uploadId);
    if (!upload || upload.status === "expired") return;
    try {
      await ctx.storage.delete(upload.storageId);
    } catch {
      // Blob may already be gone.
    }
    await ctx.db.patch(args.uploadId, { status: "expired" });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireDutyWrite(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const registerUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireDutyWrite(ctx);
    const fileName = args.fileName.trim();
    if (!fileName.toLowerCase().endsWith(".xlsx")) throw new Error("INVALID_IMPORT_FILE");
    if (!args.fileSize || args.fileSize > DUTY_IMPORT_MAX_BYTES) throw new Error("IMPORT_FILE_TOO_LARGE");
    const now = Date.now();
    const expiresAt = now + DUTY_IMPORT_TTL_MS;
    const uploadId = await ctx.db.insert("dutyImportUploads", {
      storageId: args.storageId,
      fileName,
      fileSize: args.fileSize,
      uploadedBy: actor.user._id,
      status: "uploaded",
      createdAt: now,
      expiresAt,
    });
    await ctx.scheduler.runAfter(DUTY_IMPORT_TTL_MS, internal.dutyImport.purgeImportUpload, {
      uploadId,
    });
    await ctx.db.insert("auditLogs", {
      actorUserId: actor.user._id,
      action: "duty.import_upload",
      details: JSON.stringify({ uploadId, fileName, fileSize: args.fileSize }),
      at: now,
    });
    return { uploadId, expiresAt };
  },
});

type UploadDoc = {
  _id: Id<"dutyImportUploads">;
  storageId: Id<"_storage">;
  fileName: string;
  fileSize: number;
  uploadedBy: Id<"users">;
  status: string;
  rowCount?: number;
  createdAt: number;
  expiresAt: number;
};

type ValidateLoadResult = {
  upload: UploadDoc;
  ok: boolean;
  errors: DutyImportError[];
  preview: DutyImportPreviewRow[];
};

async function loadAndValidateUpload(
  ctx: { runQuery: any; runAction: any },
  args: { uploadId: Id<"dutyImportUploads">; actorId: Id<"users">; forCommit?: boolean },
): Promise<ValidateLoadResult> {
  const upload = (await ctx.runQuery(internal.dutyImport.getUploadInternal, {
    uploadId: args.uploadId,
  })) as UploadDoc | null;
  if (!upload) throw new Error("IMPORT_UPLOAD_NOT_FOUND");
  assertImportUploadUsable(upload, { actorId: args.actorId, forCommit: args.forCommit });
  if (upload.fileSize > DUTY_IMPORT_MAX_BYTES) {
    return {
      upload,
      ok: false,
      errors: [{ rowNumber: 0, message: "File vượt quá giới hạn 2 MB.", detail: "IMPORT_FILE_TOO_LARGE" }],
      preview: [],
    };
  }

  const parsed = (await ctx.runAction(internal.dutyImportParse.parseStorageXlsx, {
    storageId: upload.storageId,
  })) as { ok: boolean; message: string | null; rows: DutySheetRow[] };
  if (!parsed.ok) {
    return {
      upload,
      ok: false,
      errors: [{ rowNumber: 0, message: parseFailureMessage(parsed.message), detail: parsed.message }],
      preview: [],
    };
  }

  const context = await ctx.runQuery(internal.dutyImport.listValidationContext, {});
  const result = validateDutyImportRows(parsed.rows, context);
  return { upload, ok: result.ok, errors: result.errors, preview: result.ok ? result.preview : [] };
}

export const validateUpload = action({
  args: { uploadId: v.id("dutyImportUploads") },
  handler: async (ctx, args): Promise<{
    ok: boolean;
    errors: DutyImportError[];
    preview: DutyImportPreviewRow[];
    fileName: string;
    expiresAt: number;
  }> => {
    const actorId = await authUserIdOrThrow(ctx);
    await ctx.runQuery(internal.dutyImport.listValidationContext, {});
    const result = await loadAndValidateUpload(ctx, { uploadId: args.uploadId, actorId });
    return {
      ok: result.ok,
      errors: result.errors,
      preview: result.preview,
      fileName: result.upload.fileName,
      expiresAt: result.upload.expiresAt,
    };
  },
});

export const commit = action({
  args: { uploadId: v.id("dutyImportUploads") },
  handler: async (
    ctx,
    args,
  ): Promise<{ createdCount: number; duties: { id: string; title: string }[] }> => {
    const actorId = await authUserIdOrThrow(ctx);
    await ctx.runQuery(internal.dutyImport.listValidationContext, {});
    const result = await loadAndValidateUpload(ctx, {
      uploadId: args.uploadId,
      actorId,
      forCommit: true,
    });
    if (!result.ok) throw new Error("IMPORT_VALIDATION_FAILED");

    await ctx.runMutation(internal.dutyImport.claimUploadForCommit, { uploadId: args.uploadId });
    try {
      return await ctx.runMutation(internal.dutyImport.commitValidatedInternal, {
        uploadId: args.uploadId,
        rows: result.preview,
      });
    } catch (error) {
      try {
        await ctx.runMutation(internal.dutyImport.releaseUploadClaim, { uploadId: args.uploadId });
      } catch {
        // Best-effort: leave committing so a retry is explicit rather than double-create.
      }
      throw error;
    }
  },
});
