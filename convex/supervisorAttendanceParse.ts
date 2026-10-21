"use node";

import { v } from "convex/values";
import * as XLSX from "xlsx";
import { internalAction } from "./_generated/server";
import { rowsFromSupervisorMatrix, SUPERVISOR_IMPORT_MAX_BYTES } from "./supervisorAttendancePolicy";

const MAX_SHEETS = 5;

/** Reads the 3-column Giám thị template from storage: the first sheet with the headers wins. */
export const parseStorageXlsx = internalAction({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) return { ok: false as const, message: "IMPORT_UPLOAD_NOT_FOUND" };
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (!buffer.length) return { ok: false as const, message: "IMPORT_FILE_EMPTY" };
    if (buffer.length > SUPERVISOR_IMPORT_MAX_BYTES) return { ok: false as const, message: "IMPORT_FILE_TOO_LARGE" };
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer", raw: false });
    } catch {
      return { ok: false as const, message: "INVALID_IMPORT_FILE" };
    }
    let failure = "SUPERVISOR_IMPORT_HEADERS";
    for (const sheetName of workbook.SheetNames.slice(0, MAX_SHEETS)) {
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        defval: "",
        raw: false,
      }) as unknown[][];
      const parsed = rowsFromSupervisorMatrix(matrix);
      if (parsed.ok) return { ok: true as const, rows: parsed.rows };
      if (parsed.message !== "SUPERVISOR_IMPORT_HEADERS") {
        failure = parsed.message;
        break;
      }
    }
    return { ok: false as const, message: failure };
  },
});
