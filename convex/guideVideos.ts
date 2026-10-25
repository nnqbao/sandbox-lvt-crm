/**
 * Tutorial videos of the public user guide (/huong-dan-su-dung.html) live in Convex File Storage,
 * not in git. They show fictional data only, so they are PUBLIC content: unlike private work /
 * people-review files, their storage URL may reach the browser (the gateway redirects
 * /huong-dan/video/<id>.mp4|webp to it).
 *
 * Writes are internal only: `npm run guide:videos:publish -- <dev|prod>` uploads through the Convex
 * CLI with the deploy key (scripts/lvt-convex-cloud-env.sh). Nothing here is callable by app users
 * except the read-only `url` query.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";

const VIDEO_ID = /^[a-z0-9-]{2,60}$/;
const KINDS = { video: "video/mp4", poster: "image/webp" } as const;
const kindValidator = v.union(v.literal("video"), v.literal("poster"));
/** Same ceiling as the guide videos' size budget; a 1080p tutorial is ~5–16 MB. */
const MAX_BYTES = 200 * 1024 * 1024;

function assertVideoId(videoId: string) {
  if (!VIDEO_ID.test(videoId)) throw new Error("GUIDE_VIDEO_ID_INVALID");
}

async function currentRow(ctx: any, videoId: string, kind: string) {
  return await ctx.db
    .query("guideVideos")
    .withIndex("by_video_kind", (q: any) => q.eq("videoId", videoId).eq("kind", kind))
    .unique();
}

/** Public: storage URL of a published guide video or poster (null when not published). */
export const url = query({
  args: { videoId: v.string(), kind: kindValidator },
  handler: async (ctx, args) => {
    if (!VIDEO_ID.test(args.videoId)) return null;
    const row = await currentRow(ctx, args.videoId, args.kind);
    return row ? await ctx.storage.getUrl(row.storageId) : null;
  },
});

export const current = internalQuery({
  args: { videoId: v.string(), kind: kindValidator },
  handler: async (ctx, args) => {
    assertVideoId(args.videoId);
    const row = await currentRow(ctx, args.videoId, args.kind);
    return row ? { sha256: row.sha256, size: row.size, updatedAt: row.updatedAt } : null;
  },
});

export const issueUploadUrl = internalMutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

/** Point a guide video/poster at a freshly uploaded object; the replaced object is deleted. */
export const register = internalMutation({
  args: { videoId: v.string(), kind: kindValidator, storageId: v.id("_storage"), sha256: v.string() },
  handler: async (ctx, args) => {
    assertVideoId(args.videoId);
    const object = await ctx.db.system.get("_storage", args.storageId);
    if (!object || !object.size || object.size > MAX_BYTES) throw new Error("GUIDE_VIDEO_FILE_INVALID");
    const expectedType = KINDS[args.kind];
    if (object.contentType && object.contentType !== expectedType) throw new Error("GUIDE_VIDEO_TYPE_INVALID");
    const now = Date.now();
    const row = await currentRow(ctx, args.videoId, args.kind);
    if (row) {
      const previous = row.storageId as Id<"_storage">;
      await ctx.db.patch(row._id, { storageId: args.storageId, sha256: args.sha256, size: object.size, updatedAt: now });
      if (previous !== args.storageId) await ctx.storage.delete(previous);
    } else {
      await ctx.db.insert("guideVideos", {
        videoId: args.videoId,
        kind: args.kind,
        storageId: args.storageId,
        sha256: args.sha256,
        size: object.size,
        updatedAt: now,
      });
    }
    return { videoId: args.videoId, kind: args.kind, size: object.size };
  },
});
