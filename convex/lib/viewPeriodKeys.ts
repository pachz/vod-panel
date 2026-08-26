import { v } from "convex/values";

export type ViewGranularity = "total" | "day" | "week" | "month";

export type ViewCounts = {
  total: number;
  day: number;
  week: number;
  month: number;
};

export const viewGranularityValidator = v.union(
  v.literal("total"),
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
);

export const viewCountsValidator = v.object({
  total: v.number(),
  day: v.number(),
  week: v.number(),
  month: v.number(),
});

export const MAX_CONTENT_ANALYTICS_RANGE_DAYS = 31;

/** UTC calendar day: YYYY-MM-DD */
export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** UTC calendar month: YYYY-MM */
export function utcMonthKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

/**
 * ISO week key in UTC: YYYY-Www (week-year may differ from calendar year).
 */
export function utcIsoWeekKey(ms: number): string {
  const date = new Date(ms);
  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // ISO: week belongs to the year of its Thursday
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const isoYear = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function periodKeysAt(ms: number): Array<{
  granularity: ViewGranularity;
  periodKey: string;
}> {
  return [
    { granularity: "total", periodKey: "all" },
    { granularity: "day", periodKey: utcDayKey(ms) },
    { granularity: "week", periodKey: utcIsoWeekKey(ms) },
    { granularity: "month", periodKey: utcMonthKey(ms) },
  ];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseUtcDayKey(date: string): string | null {
  if (!DATE_PATTERN.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function addDaysToUtcDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return utcDayKey(shifted.getTime());
}

export function enumerateUtcDayKeys(
  startDay: string,
  endDay: string,
): string[] {
  const keys: string[] = [];
  let current = startDay;
  while (current <= endDay) {
    keys.push(current);
    current = addDaysToUtcDayKey(current, 1);
  }
  return keys;
}

export function defaultContentAnalyticsEndDate(): string {
  return utcDayKey(Date.now());
}

export function defaultContentAnalyticsStartDate(dayCount = 30): string {
  const end = utcDayKey(Date.now());
  return addDaysToUtcDayKey(end, -(dayCount - 1));
}

export function previousUtcPeriod(
  startDay: string,
  endDay: string,
): { startDay: string; endDay: string } {
  const days = enumerateUtcDayKeys(startDay, endDay).length;
  const prevEnd = addDaysToUtcDayKey(startDay, -1);
  const prevStart = addDaysToUtcDayKey(prevEnd, -(days - 1));
  return { startDay: prevStart, endDay: prevEnd };
}
