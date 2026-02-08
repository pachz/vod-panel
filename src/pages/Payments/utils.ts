import { format } from "date-fns";

/**
 * Safely format a timestamp (number or string) for display.
 */
export function formatDate(timestamp: number | string | undefined | null): string {
  if (timestamp === undefined || timestamp === null) return "N/A";
  const num = typeof timestamp === "string" ? Number(timestamp) : timestamp;
  if (isNaN(num) || num <= 0 || !isFinite(num)) return "N/A";
  const min = new Date("1970-01-01").getTime();
  const max = new Date("2100-01-01").getTime();
  if (num < min || num > max) return "N/A";
  try {
    const date = new Date(num);
    const formatted = format(date, "MMM d, yyyy");
    if (formatted.includes("NaN") || formatted === "Invalid Date") return "N/A";
    return formatted;
  } catch {
    return "N/A";
  }
}

/**
 * Format Stripe amount (cents) and currency for display.
 */
export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

/**
 * Days remaining until endDate (from now). Returns 0 if past or invalid.
 */
export function getDaysRemaining(endDate: number | string | undefined | null): number {
  if (endDate == null) return 0;
  const num = typeof endDate === "string" ? Number(endDate) : endDate;
  if (isNaN(num) || num <= 0) return 0;
  const diff = num - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
}

export type CycleInfo = {
  totalDays: number;
  daysElapsed: number;
  daysRemaining: number;
  progress: number;
  start: Date;
  end: Date;
};

export type SubscriptionPeriod = {
  currentPeriodStart?: number | null;
  currentPeriodEnd?: number | null;
};

/**
 * Compute billing cycle info from period timestamps. Returns null if invalid.
 */
export function getCycleInfo(period: SubscriptionPeriod): CycleInfo | null {
  const start = period.currentPeriodStart;
  const end = period.currentPeriodEnd;
  if (start == null || end == null) return null;

  const startTs = typeof start === "string" ? Number(start) : start;
  const endTs = typeof end === "string" ? Number(end) : end;
  if (isNaN(startTs) || isNaN(endTs) || startTs <= 0 || endTs <= 0) return null;

  const startDate = new Date(startTs);
  const endDate = new Date(endTs);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const now = Date.now();
  const daysElapsed = Math.ceil((now - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = getDaysRemaining(endTs);
  const progress = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));

  return {
    totalDays,
    daysElapsed,
    daysRemaining,
    progress,
    start: startDate,
    end: endDate,
  };
}

/**
 * Check if period timestamps are valid for display/sync.
 */
export function hasValidPeriodDates(period: SubscriptionPeriod): boolean {
  const start = period.currentPeriodStart;
  const end = period.currentPeriodEnd;
  if (start == null || end == null) return false;
  const startNum = typeof start === "string" ? Number(start) : start;
  const endNum = typeof end === "string" ? Number(end) : end;
  return !isNaN(startNum) && startNum > 0 && !isNaN(endNum) && endNum > 0;
}
