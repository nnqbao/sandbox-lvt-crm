export const RAW_OBSERVATIONS = ["present", "late", "absent", "unknown"] as const;
export const DISPOSITIONS = ["none", "pending", "excused", "unexcused", "exempt"] as const;
export const EFFECTIVE_STATUSES = [
  "present",
  "late",
  "absent_excused",
  "absent_unexcused",
  "absent_pending",
  "no_data",
  "exempt",
] as const;

export type RawObservation = (typeof RAW_OBSERVATIONS)[number];
export type Disposition = (typeof DISPOSITIONS)[number];
export type EffectiveStatus = (typeof EFFECTIVE_STATUSES)[number];

export function deriveEffectiveStatus(
  rawObservation: string,
  disposition: string,
): EffectiveStatus {
  if (disposition === "exempt") return "exempt";
  if (rawObservation === "present") return "present";
  if (rawObservation === "late") return "late";
  if (rawObservation === "unknown") return "no_data";
  if (disposition === "excused") return "absent_excused";
  if (disposition === "unexcused") return "absent_unexcused";
  return "absent_pending";
}

export function isConfirmedDisposition(disposition: string) {
  return disposition === "excused" || disposition === "unexcused" || disposition === "exempt";
}

/**
 * GVCN ticks "Vắng không phép" (unexcused) or unticks it (excused). Reason/note is optional since
 * the Điểm danh redesign; every change is still recorded in studentAttendanceCorrections.
 */
export function assertDispositionChange(args: {
  previousDisposition: string;
  nextDisposition: string;
  reasonCode?: string;
  note?: string;
}) {
  const next = args.nextDisposition.trim();
  if (!DISPOSITIONS.includes(next as Disposition)) throw new Error("INVALID_DISPOSITION");
}

export function applyPublicationPolicy(args: {
  enrollments: Array<{
    enrollmentId: string;
    studentId: string;
    classId: string;
    schoolYearId: string;
  }>;
  matchedRows: Array<{
    matchedStudentId?: string;
    rawObservation: string;
    normalizedObservedAt?: number;
    sourceImportId?: string;
  }>;
  presencePolicy: string;
  attendanceDate: string;
  sourceImportId: string;
}) {
  const byStudent = new Map(args.matchedRows.filter((row) => row.matchedStudentId).map((row) => [row.matchedStudentId, row]));
  const days = args.enrollments.map((enrollment) => {
    const matched = byStudent.get(enrollment.studentId);
    if (matched) {
      const rawObservation = matched.rawObservation || "present";
      const disposition = rawObservation === "absent" || rawObservation === "unknown" ? "pending" : "none";
      return {
        ...enrollment,
        attendanceDate: args.attendanceDate,
        sourceImportId: args.sourceImportId,
        rawObservation,
        rawObservedAt: matched.normalizedObservedAt,
        disposition,
        effectiveStatus: deriveEffectiveStatus(rawObservation, disposition),
      };
    }
    if (args.presencePolicy === "full_roster") {
      return {
        ...enrollment,
        attendanceDate: args.attendanceDate,
        sourceImportId: args.sourceImportId,
        rawObservation: "unknown",
        rawObservedAt: undefined,
        disposition: "none",
        effectiveStatus: "no_data" as const,
      };
    }
    return {
      ...enrollment,
      attendanceDate: args.attendanceDate,
      sourceImportId: args.sourceImportId,
      rawObservation: "absent",
      rawObservedAt: undefined,
      disposition: "pending",
      effectiveStatus: "absent_pending" as const,
    };
  });
  const missingOnFullRoster = args.presencePolicy === "full_roster"
    ? days.filter((row) => row.effectiveStatus === "no_data").length
    : 0;
  return {
    days,
    blockPublication: false,
    missingOnFullRoster,
    warning: missingOnFullRoster > 0 ? "CAMERA_MISSING_ROSTER_ROWS" : undefined,
  };
}

export function mergeReplacementDay(args: {
  existing: {
    rawObservation: string;
    disposition: string;
    effectiveStatus: string;
    reasonCode?: string;
    note?: string;
  };
  incomingRaw: string;
  incomingObservedAt?: number;
  mode: "supplement" | "replace_camera_observations";
}) {
  if (args.mode === "supplement") {
    if (args.existing.effectiveStatus !== "no_data") {
      return { ...args.existing, overwritten: false };
    }
  }
  const disposition = args.existing.disposition;
  return {
    rawObservation: args.incomingRaw,
    rawObservedAt: args.incomingObservedAt,
    disposition,
    effectiveStatus: deriveEffectiveStatus(args.incomingRaw, disposition),
    reasonCode: args.existing.reasonCode,
    note: args.existing.note,
    overwritten: true,
  };
}

export function planAttendanceImportWrites<
  TIncoming extends {
    studentId: string;
    rawObservation: string;
    rawObservedAt?: number;
  },
>(args: {
  incomingDays: TIncoming[];
  existingDays: Array<{
    studentId: string;
    rawObservation: string;
    disposition: string;
    effectiveStatus: string;
    reasonCode?: string;
    note?: string;
  }>;
  mode: "publish" | "supplement" | "replace";
}) {
  const inserts: TIncoming[] = [];
  const updates: Array<{
    studentId: string;
    rawObservation: string;
    rawObservedAt?: number;
    disposition: string;
    effectiveStatus: string;
    reasonCode?: string;
    note?: string;
    overwritten: true;
  }> = [];
  const mergeMode = args.mode === "replace" ? "replace_camera_observations" : "supplement";

  for (const day of args.incomingDays) {
    const current = args.existingDays.find((row) => row.studentId === day.studentId);
    if (!current) {
      inserts.push(day);
      continue;
    }
    if (args.mode === "publish") continue;
    const merged = mergeReplacementDay({
      existing: current,
      incomingRaw: day.rawObservation,
      incomingObservedAt: day.rawObservedAt,
      mode: mergeMode,
    });
    if (!merged.overwritten) continue;
    updates.push({
      studentId: day.studentId,
      rawObservation: merged.rawObservation,
      rawObservedAt: merged.rawObservedAt,
      disposition: merged.disposition,
      effectiveStatus: merged.effectiveStatus,
      ...(merged.reasonCode ? { reasonCode: merged.reasonCode } : {}),
      ...(merged.note ? { note: merged.note } : {}),
      overwritten: true,
    });
  }

  return {
    inserts,
    updates,
    changedCount: inserts.length + updates.length,
  };
}

export function attendanceImportPublishResult(args: { uploadId: string; changedCount: number }) {
  return {
    importId: args.uploadId,
    published: true,
    count: args.changedCount,
  };
}
