import type { PlanTheme } from "./validation/plan";

export type PlanThemeInput = {
  primary: string;
  secondary: string;
  headerBg: string;
};

export const DEFAULT_PLAN_THEME_INPUT: PlanThemeInput = {
  primary: "#E91E8C",
  secondary: "#9C27B0",
  headerBg: "#FFFFFF",
};

function parseHex(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((channel) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixHexColors(from: string, to: string, amount: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  const t = Math.min(1, Math.max(0, amount));
  return toHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
}

/** Derive full card theme from the three admin-picked colors. */
export function expandPlanTheme(input: PlanThemeInput): PlanTheme {
  return {
    primary: input.primary,
    secondary: input.secondary,
    headerBg: input.headerBg,
    border: mixHexColors(input.primary, "#E5E7EB", 0.28),
    buttonBg: input.primary,
  };
}

/** Load editor state from stored theme (legacy plans may have custom border/button). */
export function collapsePlanTheme(theme: PlanTheme): PlanThemeInput {
  return {
    primary: theme.primary,
    secondary: theme.secondary,
    headerBg: theme.headerBg,
  };
}
