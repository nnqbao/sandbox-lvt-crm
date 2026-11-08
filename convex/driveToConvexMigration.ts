import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { convexObjectKey, MAX_PRIVATE_FILE_BYTES, storageIdFromObjectKey } from "./fileObjects";

/**
 * One-off move of legacy Google Drive objects into Convex File Storage (owner, 2026-11-08), run
 * by scripts/migrate-drive-files-to-convex.mjs through the admin CLI. Only active records are
 * moved (inactive ones are never served). The Drive object itself is left untouched, so a record
 * can be pointed back at it. Internal functions only: no client can call them.
 */

const TABLES = ["officeDocuments", "personnelFaults", "personnelEvaluationFiles", "workItems", "personalTasks"] as const;
type Table = (typeof TABLES)[number];
const COMPLETION_TABLES = new Set<Table>(["workItems", "personalTasks"]);

const isDriveKey = (key: unknown) => typeof key === "string" && key.length > 0 && !storageIdFromObjectKey(key);

/** Every active Drive-backed file: top-level `driveFileId` rows and work completion evidence. */
export const listDriveObjects = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: Array<{
      table: Table;
      id: string;
      userId: string | null;
      driveFileId: string;
      driveChecksum: string | null;
      fileName: string | null;
      fileSize: number | null;
    }> = [];
    const documents = new Map<string, any>();
    for (const document of await ctx.db.query("officeDocuments").collect()) documents.set(String(document._id), document);
    for (const table of TABLES) {
      for (const row of await ctx.db.query(table).collect()) {
        const r = row as any;
        if (!r.active) continue;
        if (COMPLETION_TABLES.has(table)) {
          for (const completion of r.completions || []) {
            if (!isDriveKey(completion.driveFileId)) continue;
            out.push({
              table,
              id: String(r._id),
              userId: String(completion.userId),
              driveFileId: completion.driveFileId,
              driveChecksum: completion.driveChecksum || null,
              fileName: completion.fileName || null,
              fileSize: completion.fileSize ?? null,
            });
          }
        } else if (isDriveKey(r.driveFileId)) {
          out.push({
            table,
            id: String(r._id),
            userId: null,
            driveFileId: r.driveFileId,
            driveChecksum: r.driveChecksum || null,
            fileName: r.fileName || null,
            fileSize: r.fileSize ?? null,
          });
        }
      }
    }
    return out;
  },
});

export const issueUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

const hexToBase64 = (hex: string) => {
  const bytes = new Uint8Array(hex.match(/../g)!.map((pair) => parseInt(pair, 16)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/**
 * Point one record at the uploaded copy. Refuses unless the record still holds the same Drive key
 * and Convex's own SHA-256 / size of the stored object match the downloaded Drive bytes.
 */
export const adoptConvexObject = internalMutation({
  args: {
    table: v.string(),
    id: v.string(),
    userId: v.optional(v.string()),
    driveFileId: v.string(),
    storageId: v.id("_storage"),
    sha256: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const table = args.table as Table;
    if (!TABLES.includes(table)) throw new Error("UNKNOWN_TABLE");
    if (!/^[0-9a-f]{64}$/.test(args.sha256)) throw new Error("INVALID_SHA256");
    const stored = await ctx.db.system.get(args.storageId);
    if (!stored || stored.size !== args.size || args.size <= 0 || args.size > MAX_PRIVATE_FILE_BYTES) {
      throw new Error("STORED_OBJECT_SIZE_MISMATCH");
    }
    if (stored.sha256 !== hexToBase64(args.sha256)) throw new Error("STORED_OBJECT_SHA256_MISMATCH");

    const row = (await ctx.db.get(args.id as any)) as any;
    if (!row?.active) return { applied: false, reason: "RECORD_INACTIVE" };
    const key = convexObjectKey(args.storageId);
    const now = Date.now();
    if (COMPLETION_TABLES.has(table)) {
      let matched = 0;
      const completions = (row.completions || []).map((completion: any) => {
        if (String(completion.userId) !== String(args.userId) || completion.driveFileId !== args.driveFileId) return completion;
        matched += 1;
        return { ...completion, driveFileId: key, driveChecksum: args.sha256 };
      });
      if (matched !== 1) return { applied: false, reason: "COMPLETION_CHANGED" };
      await ctx.db.patch(row._id, { completions });
    } else {
      if (row.driveFileId !== args.driveFileId) return { applied: false, reason: "RECORD_CHANGED" };
      await ctx.db.patch(row._id, {
        driveFileId: key,
        driveChecksum: args.sha256,
        ...(table === "officeDocuments" ? { storageProvider: "convex" } : {}),
      });
    }
    await ctx.db.insert("auditLogs", {
      actorUserId: "system:drive-to-convex",
      action: "file.drive_to_convex",
      details: JSON.stringify({ table, id: args.id, userId: args.userId || null, from: args.driveFileId, to: key, size: args.size }),
      at: now,
    });
    return { applied: true, key };
  },
});
