import { storageIdFromObjectKey, storedObjectRegistrable } from "./fileObjects";

const STAGED = "staged";
const COMMITTED = "committed";
const CLEANUP_CLAIMED = "cleanup_claimed";

async function stageByToken(ctx: any, cleanupToken: string) {
  return await ctx.db
    .query("driveUploadStages")
    .withIndex("by_cleanup_token", (q: any) => q.eq("cleanupToken", cleanupToken))
    .unique();
}

export async function registerDriveUploadStage(
  ctx: any,
  args: { cleanupToken: string; driveFileId: string },
  userId: string,
  purpose: "work" | "people-review",
) {
  if (!/^[0-9a-f-]{36}$/i.test(args.cleanupToken)) throw new Error("INVALID_UPLOAD");
  if (!/^[a-zA-Z0-9_-]+$/.test(args.driveFileId)) throw new Error("INVALID_UPLOAD");
  if (await stageByToken(ctx, args.cleanupToken)) throw new Error("UPLOAD_TOKEN_EXISTS");
  const now = Date.now();
  const storageId = storageIdFromObjectKey(args.driveFileId);
  if (storageId) {
    // Only a just-stored, unclaimed Convex object can be staged: a caller can't adopt (and later
    // delete through cleanup) an object that belongs to someone else's record.
    const object = await ctx.db.system.get("_storage", storageId).catch(() => null);
    const alreadyStaged = Boolean(await ctx.db
      .query("driveUploadStages")
      .withIndex("by_drive_file", (q: any) => q.eq("driveFileId", args.driveFileId))
      .first());
    if (!storedObjectRegistrable(object, now, alreadyStaged)) throw new Error("INVALID_UPLOAD");
  }
  await ctx.db.insert("driveUploadStages", {
    cleanupToken: args.cleanupToken,
    driveFileId: args.driveFileId,
    purpose,
    userId,
    status: STAGED,
    createdAt: now,
    updatedAt: now,
  });
}

export async function commitDriveUploadStage(
  ctx: any,
  args: { cleanupToken: string; driveFileId: string },
  userId: string,
  purpose: "work" | "people-review",
) {
  const stage = await stageByToken(ctx, args.cleanupToken);
  if (!stage) throw new Error("UPLOAD_NOT_FOUND");
  if (stage.userId !== userId || stage.purpose !== purpose || stage.driveFileId !== args.driveFileId) {
    throw new Error("UPLOAD_MISMATCH");
  }
  if (stage.status === CLEANUP_CLAIMED) throw new Error("UPLOAD_CLEANUP_IN_PROGRESS");
  if (stage.status !== STAGED) throw new Error("UPLOAD_ALREADY_COMMITTED");
  await ctx.db.patch(stage._id, { status: COMMITTED, updatedAt: Date.now() });
}

export async function claimDriveUploadCleanup(
  ctx: any,
  args: { cleanupToken: string; claimId: string },
  userId: string,
  purpose: "work" | "people-review",
) {
  const stage = await stageByToken(ctx, args.cleanupToken);
  if (!stage) throw new Error("UPLOAD_NOT_FOUND");
  if (stage.userId !== userId || stage.purpose !== purpose) throw new Error("UPLOAD_FORBIDDEN");
  if (stage.status === COMMITTED) return { action: "retain" as const, driveFileId: stage.driveFileId };
  if (stage.status === CLEANUP_CLAIMED) {
    if (stage.claimId === args.claimId) return { action: "delete" as const, driveFileId: stage.driveFileId };
    throw new Error("UPLOAD_CLEANUP_IN_PROGRESS");
  }
  await ctx.db.patch(stage._id, {
    status: CLEANUP_CLAIMED,
    claimId: args.claimId,
    updatedAt: Date.now(),
  });
  return { action: "delete" as const, driveFileId: stage.driveFileId };
}

export async function finalizeDriveUploadStage(
  ctx: any,
  cleanupToken: string,
  userId: string,
  purpose: "work" | "people-review",
) {
  const stage = await stageByToken(ctx, cleanupToken);
  if (!stage) throw new Error("UPLOAD_NOT_FOUND");
  if (stage.userId !== userId || stage.purpose !== purpose) throw new Error("UPLOAD_FORBIDDEN");
  if (stage.status !== COMMITTED) throw new Error("UPLOAD_NOT_FINALIZED");
}

export async function completeDriveUploadCleanup(
  ctx: any,
  args: { cleanupToken: string; claimId: string },
  userId: string,
  purpose: "work" | "people-review",
) {
  const stage = await stageByToken(ctx, args.cleanupToken);
  if (!stage) return;
  if (stage.userId !== userId || stage.purpose !== purpose) throw new Error("UPLOAD_FORBIDDEN");
  if (stage.status !== CLEANUP_CLAIMED || stage.claimId !== args.claimId) {
    throw new Error("UPLOAD_CLEANUP_CLAIM_LOST");
  }
  await deleteConvexObject(ctx, stage.driveFileId);
  await ctx.db.delete(stage._id);
}

/** Deletes the Convex Storage object behind a `cvx_` key (no-op for Drive keys / missing objects). */
export async function deleteConvexObject(ctx: any, key: string) {
  const storageId = storageIdFromObjectKey(key);
  if (!storageId) return;
  const object = await ctx.db.system.get("_storage", storageId).catch(() => null);
  if (object) await ctx.storage.delete(storageId);
}

export async function releaseDriveUploadCleanup(
  ctx: any,
  args: { cleanupToken: string; claimId: string },
  userId: string,
  purpose: "work" | "people-review",
) {
  const stage = await stageByToken(ctx, args.cleanupToken);
  if (!stage) return;
  if (stage.userId !== userId || stage.purpose !== purpose) throw new Error("UPLOAD_FORBIDDEN");
  if (stage.status === CLEANUP_CLAIMED && stage.claimId === args.claimId) {
    await ctx.db.patch(stage._id, {
      status: STAGED,
      claimId: undefined,
      updatedAt: Date.now(),
    });
  }
}
