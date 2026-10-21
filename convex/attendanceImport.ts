/**
 * Camera attendance import (file "Bảng thống kê điểm danh học sinh toàn trường") — RETIRED.
 * Giám thị now marks attendance on the Điểm danh menu (convex/supervisorAttendance.ts).
 * Write paths refuse with ATTENDANCE_CAMERA_IMPORT_RETIRED; existing camera rows/tables are kept and
 * still read by history and reports. Only admin/mod may read the old upload history.
 */
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { assertAttendanceImporter, homeroomActorOrThrow } from "./homeroomContext";
import { assertYmd } from "./homeroomTime";
import { daysForYearOnDate, usersByIds } from "./homeroomData";
import { ATTENDANCE_CAMERA_IMPORT_RETIRED } from "./supervisorAttendancePolicy";

export const SCHOOL_SOURCE_KIND = "camera_school_excel";

function retired(): never {
  throw new Error(ATTENDANCE_CAMERA_IMPORT_RETIRED);
}

export const generateUploadUrl = mutation({
  args: { schoolYearId: v.string(), attendanceDate: v.string() },
  handler: async () => retired(),
});

export const registerUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    schoolYearId: v.string(),
    attendanceDate: v.string(),
  },
  handler: async () => retired(),
});

export const validate = action({
  args: { uploadId: v.string() },
  handler: async () => retired(),
});

export const publish = mutation({
  args: { uploadId: v.string(), replaceMode: v.optional(v.string()) },
  handler: async () => retired(),
});

/** Read-only history: camera files published for a day (admin/mod only). */
export const uploadsForDate = query({
  args: { schoolYearId: v.string(), attendanceDate: v.string() },
  handler: async (ctx, args) => {
    const { actor } = await homeroomActorOrThrow(ctx);
    await assertAttendanceImporter(ctx, actor, args.schoolYearId);
    const date = assertYmd(args.attendanceDate);
    const uploads = (
      await ctx.db
        .query("attendanceImportUploads")
        .withIndex("by_date", (q) => q.eq("attendanceDate", date))
        .collect()
    ).filter((row) => row.schoolYearId === args.schoolYearId && row.status === "published");
    const users = await usersByIds(ctx, uploads.map((row) => row.uploadedBy));
    const days = await daysForYearOnDate(ctx, args.schoolYearId, date);
    return {
      publishedClassCount: new Set(days.map((row) => row.classId)).size,
      uploads: uploads
        .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
        .map((row) => ({
          _id: String(row._id),
          fileName: row.fileName,
          publishedAt: row.publishedAt,
          uploadedByName: users.get(row.uploadedBy)?.name || "",
          rowCount: row.rowCount,
          matchedCount: row.matchedCount,
        })),
    };
  },
});
