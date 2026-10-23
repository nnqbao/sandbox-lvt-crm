/**
 * Pure rules for Lịch dạy (weekly timetable), Sổ đầu bài and Học bạ.
 * No Convex imports so tests (and src/lib/teachingSchedule.js parity checks) can load it directly.
 */

export const TIMETABLE_WEEKDAYS = [1, 2, 3, 4, 5] as const; // Thứ 2 … Thứ 6
export const TIMETABLE_SESSIONS = ["morning", "afternoon"] as const;
export const TIMETABLE_PERIODS = [1, 2, 3, 4, 5] as const;
export type TimetableSession = (typeof TIMETABLE_SESSIONS)[number];

/**
 * Giờ bắt đầu từng tiết, dùng để xếp "lớp sắp tới giờ dạy" và để biết tiết đã bắt đầu chưa.
 * Trường chưa cung cấp giờ chuông: đây là khung THCS phổ biến (45 phút/tiết).
 */
export const PERIOD_START_TIMES: Record<TimetableSession, readonly string[]> = {
  morning: ["07:00", "07:50", "08:50", "09:40", "10:30"],
  afternoon: ["13:30", "14:20", "15:20", "16:10", "17:00"],
};

export const DEFAULT_SUBJECTS = [
  { code: "TOAN", name: "Toán" },
  { code: "NGU_VAN", name: "Ngữ văn" },
  { code: "TIENG_ANH", name: "Tiếng Anh" },
  { code: "KHTN", name: "Khoa học tự nhiên" },
  { code: "LS_DL", name: "Lịch sử và Địa lí" },
  { code: "GDCD", name: "Giáo dục công dân" },
  { code: "TIN_HOC", name: "Tin học" },
  { code: "CONG_NGHE", name: "Công nghệ" },
  { code: "GDTC", name: "Giáo dục thể chất" },
  { code: "NGHE_THUAT", name: "Nghệ thuật" },
  { code: "HDTN", name: "Hoạt động trải nghiệm, hướng nghiệp" },
  { code: "GDDP", name: "Nội dung giáo dục địa phương" },
] as const;

export const DEFAULT_TEST_TYPES = [
  { name: "Miệng", coefficient: 1 },
  { name: "15 phút", coefficient: 1 },
  { name: "Thực hành", coefficient: 1 },
  { name: "1 tiết", coefficient: 2 },
  { name: "Giữa kỳ", coefficient: 2 },
  { name: "Cuối kỳ", coefficient: 3 },
] as const;

export const TEST_TYPE_COEFFICIENT_MAX = 5;
export const LESSON_COMMENT_MAX = 1000;

export const INVALID_TIMETABLE_CELL = "INVALID_TIMETABLE_CELL";
export const TIMETABLE_DATE_OUTSIDE_YEAR = "TIMETABLE_DATE_OUTSIDE_YEAR";
export const TIMETABLE_TEACHER_CONFLICT = "TIMETABLE_TEACHER_CONFLICT";
export const TIMETABLE_SUBJECT_NOT_TAUGHT = "TIMETABLE_SUBJECT_NOT_TAUGHT";
export const TIMETABLE_CELL_CHANGED = "TIMETABLE_CELL_CHANGED";
export const INVALID_COEFFICIENT = "INVALID_COEFFICIENT";
export const INVALID_SCORE = "INVALID_SCORE";
export const INVALID_SEMESTER = "INVALID_SEMESTER";
export const INVALID_RATING = "INVALID_RATING";
export const INVALID_LESSON_COMMENT = "INVALID_LESSON_COMMENT";
export const LESSON_NOT_SCHEDULED = "LESSON_NOT_SCHEDULED";
export const LESSON_IN_FUTURE = "LESSON_IN_FUTURE";
export const GRADE_SUBJECT_FORBIDDEN = "GRADE_SUBJECT_FORBIDDEN";
export const GRADEBOOK_FORBIDDEN = "GRADEBOOK_FORBIDDEN";

export type TimetableCell = { weekday: number; session: string; period: number };

export type TimetableSlot = TimetableCell & {
  _id?: string;
  classId: string;
  teacherId: string;
  subjectId: string;
  effectiveFrom: string;
  effectiveTo?: string;
};

export function assertTimetableCell(cell: TimetableCell): TimetableCell {
  const ok =
    (TIMETABLE_WEEKDAYS as readonly number[]).includes(cell.weekday)
    && (TIMETABLE_SESSIONS as readonly string[]).includes(cell.session)
    && (TIMETABLE_PERIODS as readonly number[]).includes(cell.period);
  if (!ok) throw new Error(INVALID_TIMETABLE_CELL);
  return { weekday: cell.weekday, session: cell.session, period: cell.period };
}

export function cellKey(cell: TimetableCell): string {
  return `${cell.weekday}-${cell.session}-${cell.period}`;
}

export function sameCell(a: TimetableCell, b: TimetableCell): boolean {
  return a.weekday === b.weekday && a.session === b.session && a.period === b.period;
}

export function addDaysYmd(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

/** 1 = Thứ 2 … 7 = Chủ nhật, computed on the calendar date. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function slotCoversDate(slot: { effectiveFrom: string; effectiveTo?: string }, date: string): boolean {
  return slot.effectiveFrom <= date && (!slot.effectiveTo || date <= slot.effectiveTo);
}

/** Slot still applies on or after `date` (it may start later). */
export function slotReachesDate(slot: { effectiveTo?: string }, date: string): boolean {
  return !slot.effectiveTo || slot.effectiveTo >= date;
}

/**
 * Plan for replacing one timetable cell of a class from `effectiveFrom` onward.
 * Rows starting on/after the date are removed, rows running across it end the day before,
 * and the new teacher (if any) gets an open-ended row. Earlier lessons keep their teacher.
 */
export function planCellChange(
  rows: Array<{ _id: string; teacherId: string; subjectId: string; effectiveFrom: string; effectiveTo?: string }>,
  effectiveFrom: string,
  next: { teacherId: string; subjectId: string } | null,
) {
  const live = rows.filter((row) => slotReachesDate(row, effectiveFrom));
  const current = live.find((row) => slotCoversDate(row, effectiveFrom));
  const later = live.filter((row) => row.effectiveFrom > effectiveFrom);
  if (
    next
    && current
    && !later.length
    && !current.effectiveTo
    && current.teacherId === next.teacherId
    && current.subjectId === next.subjectId
  ) {
    return { deletes: [] as string[], ends: [] as Array<{ id: string; effectiveTo: string }>, insert: null, changed: false };
  }
  if (!next && !live.length) {
    return { deletes: [] as string[], ends: [] as Array<{ id: string; effectiveTo: string }>, insert: null, changed: false };
  }
  const deletes: string[] = [];
  const ends: Array<{ id: string; effectiveTo: string }> = [];
  for (const row of live) {
    if (row.effectiveFrom >= effectiveFrom) deletes.push(row._id);
    else ends.push({ id: row._id, effectiveTo: addDaysYmd(effectiveFrom, -1) });
  }
  return { deletes, ends, insert: next ? { ...next, effectiveFrom } : null, changed: true };
}

/** A teacher cannot stand in two classes in the same cell on overlapping dates. */
export function findTeacherConflict(
  teacherSlots: TimetableSlot[],
  cell: TimetableCell,
  effectiveFrom: string,
  classId: string,
): TimetableSlot | undefined {
  return teacherSlots.find(
    (slot) => slot.classId !== classId && sameCell(slot, cell) && slotReachesDate(slot, effectiveFrom),
  );
}

export type CalendarOverride = { date: string; kind: string };

/** Ngày dạy theo TKB tuần: trong năm học, Thứ 2–6, không phải ngày nghỉ lễ. */
export function isTimetableDay(
  date: string,
  year: { startDate: string; endDate: string },
  holidays: ReadonlySet<string>,
): boolean {
  if (date < year.startDate || date > year.endDate) return false;
  if (isoWeekday(date) > 5) return false;
  return !holidays.has(date);
}

export function holidaySet(overrides: readonly CalendarOverride[]): Set<string> {
  return new Set(overrides.filter((row) => row.kind === "holiday").map((row) => row.date));
}

export type Lesson = {
  date: string;
  weekday: number;
  session: string;
  period: number;
  classId: string;
  teacherId: string;
  subjectId: string;
};

/** Expand weekly slots into dated lessons between `from` and `to` (inclusive). */
export function expandLessons(
  slots: readonly TimetableSlot[],
  args: { from: string; to: string; year: { startDate: string; endDate: string }; holidays: ReadonlySet<string> },
): Lesson[] {
  const lessons: Lesson[] = [];
  const from = args.from < args.year.startDate ? args.year.startDate : args.from;
  const to = args.to > args.year.endDate ? args.year.endDate : args.to;
  for (let date = from; date <= to; date = addDaysYmd(date, 1)) {
    if (!isTimetableDay(date, args.year, args.holidays)) continue;
    const weekday = isoWeekday(date);
    for (const slot of slots) {
      if (slot.weekday !== weekday || !slotCoversDate(slot, date)) continue;
      lessons.push({
        date,
        weekday,
        session: slot.session,
        period: slot.period,
        classId: slot.classId,
        teacherId: slot.teacherId,
        subjectId: slot.subjectId,
      });
    }
  }
  return lessons.sort(compareLessons);
}

export function lessonStartTime(lesson: { session: string; period: number }): string {
  const times = PERIOD_START_TIMES[lesson.session as TimetableSession] || PERIOD_START_TIMES.morning;
  return times[lesson.period - 1] || "00:00";
}

export function compareLessons(a: { date: string; session: string; period: number }, b: { date: string; session: string; period: number }) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const time = lessonStartTime(a).localeCompare(lessonStartTime(b));
  return time || a.period - b.period;
}

// ------------------------------------------------------------------ Học bạ

export function assertScore(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 10) throw new Error(INVALID_SCORE);
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - value) > 1e-9) throw new Error(INVALID_SCORE);
  return rounded;
}

export function assertCoefficient(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > TEST_TYPE_COEFFICIENT_MAX) throw new Error(INVALID_COEFFICIENT);
  return value;
}

export function assertSemester(value: number): 1 | 2 {
  if (value !== 1 && value !== 2) throw new Error(INVALID_SEMESTER);
  return value;
}

export function assertRating(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error(INVALID_RATING);
  return value;
}

export function cleanLessonComment(value: string): string {
  const text = String(value || "").trim();
  if (text.length > LESSON_COMMENT_MAX) throw new Error(INVALID_LESSON_COMMENT);
  return text;
}

/** Học kỳ của một ngày: từ ngày bắt đầu HK II trở đi là HK II; năm chưa đặt ngày → HK I. */
export function semesterForDate(date: string, year: { semester2StartDate?: string }): 1 | 2 {
  return year.semester2StartDate && date >= year.semester2StartDate ? 2 : 1;
}

/** Điểm trung bình làm tròn 1 chữ số thập phân (8,25 → 8,3). */
export function roundAverage(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/**
 * ĐTB môn học kỳ = Σ(điểm × hệ số) / Σ hệ số.
 * Với hệ số 1 (thường xuyên), 2 (giữa kỳ), 3 (cuối kỳ) đây đúng là
 * (TĐĐGtx + 2×ĐĐGgk + 3×ĐĐGck) / (số ĐĐGtx + 5).
 */
export function semesterAverage(entries: ReadonlyArray<{ score: number; coefficient: number }>): number | null {
  let weighted = 0;
  let weights = 0;
  for (const entry of entries) {
    weighted += entry.score * entry.coefficient;
    weights += entry.coefficient;
  }
  return weights ? roundAverage(weighted / weights) : null;
}

/** ĐTB cả năm = (ĐTB HK I + 2 × ĐTB HK II) / 3 — chỉ khi đủ cả hai học kỳ. */
export function yearAverage(semester1: number | null, semester2: number | null): number | null {
  if (semester1 == null || semester2 == null) return null;
  return roundAverage((semester1 + 2 * semester2) / 3);
}

/** ĐTB chung các môn (học kỳ hoặc cả năm) = trung bình cộng ĐTB các môn đã có điểm. */
export function overallAverage(values: ReadonlyArray<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (!present.length) return null;
  return roundAverage(present.reduce((sum, value) => sum + value, 0) / present.length);
}

export type GradeEntryLike = { subjectId: string; semester: number; score: number; coefficient: number };

export function summarizeGrades(entries: readonly GradeEntryLike[], subjectIds: readonly string[]) {
  const subjects = subjectIds.map((subjectId) => {
    const own = entries.filter((entry) => entry.subjectId === subjectId);
    const hk1 = semesterAverage(own.filter((entry) => entry.semester === 1));
    const hk2 = semesterAverage(own.filter((entry) => entry.semester === 2));
    return { subjectId, semester1: hk1, semester2: hk2, year: yearAverage(hk1, hk2) };
  });
  const semester1 = overallAverage(subjects.map((row) => row.semester1));
  const semester2 = overallAverage(subjects.map((row) => row.semester2));
  return { subjects, semester1, semester2, year: yearAverage(semester1, semester2) };
}
