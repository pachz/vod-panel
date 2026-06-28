import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Crown,
  Gift,
  GraduationCap,
  Heart,
  HelpCircle,
  Medal,
  MessageCircle,
  Percent,
  Ribbon,
  Shield,
  Sparkles,
  Star,
  Users,
  Video,
  Zap,
} from "lucide-react";
import { PLAN_ICON_KEYS, isPlanIconKey, type PlanIconKey } from "../../../shared/planIconKeys";

const ICON_LABELS: Record<PlanIconKey, string> = {
  GraduationCap: "Graduation cap",
  BookOpen: "Book",
  Heart: "Heart",
  MessageCircle: "Chat bubble",
  HelpCircle: "Question",
  Crown: "Crown",
  Video: "Video",
  Calendar: "Calendar",
  Percent: "Percent",
  Star: "Star",
  Sparkles: "Sparkles",
  Gift: "Gift",
  Ribbon: "Ribbon",
  Medal: "Medal",
  Users: "Users",
  Shield: "Shield",
  Zap: "Zap",
  CheckCircle2: "Check",
};

const ICON_COMPONENTS: Record<PlanIconKey, LucideIcon> = {
  GraduationCap,
  BookOpen,
  Heart,
  MessageCircle,
  HelpCircle,
  Crown,
  Video,
  Calendar,
  Percent,
  Star,
  Sparkles,
  Gift,
  Ribbon,
  Medal,
  Users,
  Shield,
  Zap,
  CheckCircle2,
};

export const PLAN_ICON_OPTIONS: { key: PlanIconKey; label: string; Icon: LucideIcon }[] =
  PLAN_ICON_KEYS.map((key) => ({
    key,
    label: ICON_LABELS[key],
    Icon: ICON_COMPONENTS[key],
  }));

export function getPlanIcon(key: string): LucideIcon {
  if (isPlanIconKey(key)) {
    return ICON_COMPONENTS[key];
  }
  return CheckCircle2;
}

export const BADGE_TAG_OPTIONS = [
  { value: "none", labelKey: "planBadgeNone" },
  { value: "start_here", labelKey: "planBadgeStartHere" },
  { value: "best_value", labelKey: "planBadgeBestValue" },
  { value: "most_popular", labelKey: "planBadgeMostPopular" },
  { value: "limited", labelKey: "planBadgeLimited" },
  { value: "vip", labelKey: "planBadgeVip" },
] as const;

export type BadgeTag = (typeof BADGE_TAG_OPTIONS)[number]["value"];

export const BADGE_TAG_LABELS: Record<BadgeTag, string> = {
  none: "",
  start_here: "Start Here",
  best_value: "Best Value",
  most_popular: "Most Popular",
  limited: "Limited",
  vip: "VIP",
};
