/** Lucide icon keys allowed on plan features and optional plan title. */
export const PLAN_ICON_KEYS = [
  "GraduationCap",
  "BookOpen",
  "Heart",
  "MessageCircle",
  "HelpCircle",
  "Crown",
  "Video",
  "Calendar",
  "Percent",
  "Star",
  "Sparkles",
  "Gift",
  "Ribbon",
  "Medal",
  "Users",
  "Shield",
  "Zap",
  "CheckCircle2",
] as const;

export type PlanIconKey = (typeof PLAN_ICON_KEYS)[number];

export function isPlanIconKey(value: string): value is PlanIconKey {
  return (PLAN_ICON_KEYS as readonly string[]).includes(value);
}
