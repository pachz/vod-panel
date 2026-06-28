export const BADGE_TAG_VALUES = [
  "none",
  "start_here",
  "best_value",
  "most_popular",
  "limited",
  "vip",
] as const;

export type BadgeTag = (typeof BADGE_TAG_VALUES)[number];
