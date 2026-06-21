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

export const PLAN_ICON_OPTIONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "GraduationCap", label: "Graduation cap", Icon: GraduationCap },
  { key: "BookOpen", label: "Book", Icon: BookOpen },
  { key: "Heart", label: "Heart", Icon: Heart },
  { key: "MessageCircle", label: "Chat bubble", Icon: MessageCircle },
  { key: "HelpCircle", label: "Question", Icon: HelpCircle },
  { key: "Crown", label: "Crown", Icon: Crown },
  { key: "Video", label: "Video", Icon: Video },
  { key: "Calendar", label: "Calendar", Icon: Calendar },
  { key: "Percent", label: "Percent", Icon: Percent },
  { key: "Star", label: "Star", Icon: Star },
  { key: "Sparkles", label: "Sparkles", Icon: Sparkles },
  { key: "Gift", label: "Gift", Icon: Gift },
  { key: "Ribbon", label: "Ribbon", Icon: Ribbon },
  { key: "Medal", label: "Medal", Icon: Medal },
  { key: "Users", label: "Users", Icon: Users },
  { key: "Shield", label: "Shield", Icon: Shield },
  { key: "Zap", label: "Zap", Icon: Zap },
  { key: "CheckCircle2", label: "Check", Icon: CheckCircle2 },
];

const iconMap = Object.fromEntries(
  PLAN_ICON_OPTIONS.map(({ key, Icon }) => [key, Icon]),
) as Record<string, LucideIcon>;

export function getPlanIcon(key: string): LucideIcon {
  return iconMap[key] ?? CheckCircle2;
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
