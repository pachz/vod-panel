import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Kuwait (Arabia Standard Time, UTC+3, no DST). */
export const ANALYTICS_TIMEZONE = "Asia/Kuwait";

export const MAX_ANALYTICS_RANGE_DAYS = 31;

export const personalTestAnalyticsRangeSchema = z
  .object({
    startDate: z
      .string()
      .regex(DATE_PATTERN, "Start date must be YYYY-MM-DD."),
    endDate: z
      .string()
      .regex(DATE_PATTERN, "End date must be YYYY-MM-DD."),
  })
  .superRefine((value, ctx) => {
    const startKey = parseAnalyticsDate(value.startDate);
    const endKey = parseAnalyticsDate(value.endDate);

    if (startKey === null || endKey === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid calendar date.",
        path: ["startDate"],
      });
      return;
    }

    if (startKey > endKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start date must be on or before end date.",
        path: ["startDate"],
      });
      return;
    }

    const dayCount = inclusiveDayCount(startKey, endKey);
    if (dayCount > MAX_ANALYTICS_RANGE_DAYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Date range must be at most ${MAX_ANALYTICS_RANGE_DAYS} days.`,
        path: ["endDate"],
      });
    }
  });

export type PersonalTestAnalyticsRangeInput = z.infer<
  typeof personalTestAnalyticsRangeSchema
>;

function dayKeyToParts(dayKey: number) {
  return {
    year: Math.floor(dayKey / 10_000),
    month: Math.floor((dayKey % 10_000) / 100),
    day: dayKey % 100,
  };
}

function partsToDayKey(year: number, month: number, day: number): number {
  return year * 10_000 + month * 100 + day;
}

function getKuwaitDateParts(timestamp: number) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANALYTICS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(timestamp));

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return { year, month, day };
}

export function addDaysToDayKey(dayKey: number, days: number): number {
  const { year, month, day } = dayKeyToParts(dayKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return partsToDayKey(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

export function parseAnalyticsDate(date: string): number | null {
  if (!DATE_PATTERN.test(date)) {
    return null;
  }

  const [year, month, day] = date.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return partsToDayKey(year, month, day);
}

/** Map a timestamp to a Kuwait calendar day key (YYYYMMDD). */
export function toAnalyticsDateKey(timestamp: number): number {
  const { year, month, day } = getKuwaitDateParts(timestamp);
  return partsToDayKey(year, month, day);
}

export function inclusiveDayCount(startKey: number, endKey: number): number {
  return enumerateDayKeys(startKey, endKey).length;
}

export function formatDayKey(dayKey: number): string {
  const { year, month, day } = dayKeyToParts(dayKey);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function defaultAnalyticsEndDate(): string {
  return formatDayKey(toAnalyticsDateKey(Date.now()));
}

export function defaultAnalyticsStartDate(dayCount = 7): string {
  const endKey = toAnalyticsDateKey(Date.now());
  return formatDayKey(addDaysToDayKey(endKey, -(dayCount - 1)));
}

export function enumerateDayKeys(startKey: number, endKey: number): number[] {
  const keys: number[] = [];
  let currentKey = startKey;

  while (currentKey <= endKey) {
    keys.push(currentKey);
    currentKey = addDaysToDayKey(currentKey, 1);
  }

  return keys;
}

export function previousAnalyticsPeriod(startKey: number, endKey: number) {
  const dayCount = inclusiveDayCount(startKey, endKey);
  const prevEndKey = addDaysToDayKey(startKey, -1);
  const prevStartKey = addDaysToDayKey(startKey, -dayCount);

  return {
    startKey: prevStartKey,
    endKey: prevEndKey,
    startDate: formatDayKey(prevStartKey),
    endDate: formatDayKey(prevEndKey),
  };
}

function kuwaitDateFromString(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function formatAnalyticsDateLabel(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: ANALYTICS_TIMEZONE,
  }).format(kuwaitDateFromString(date));
}

export function formatAnalyticsShortDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: ANALYTICS_TIMEZONE,
  }).format(kuwaitDateFromString(date));
}

/** Start of a Kuwait calendar day as UTC epoch ms. */
export function kuwaitDayStartMs(dayKey: number): number {
  return new Date(`${formatDayKey(dayKey)}T00:00:00+03:00`).getTime();
}

/** End of a Kuwait calendar day as UTC epoch ms. */
export function kuwaitDayEndMs(dayKey: number): number {
  return new Date(`${formatDayKey(dayKey)}T23:59:59.999+03:00`).getTime();
}

export function formatAnalyticsDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: ANALYTICS_TIMEZONE,
  }).format(new Date(timestamp));
}

export function formatSubmissionDuration(seconds: number | undefined): string {
  if (seconds === undefined) {
    return "—";
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
