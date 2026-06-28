import type { BadgeTag } from "./planBadgeTags";

export type PlanPreviewLocale = "en" | "ar";

export const PLAN_BADGE_LABELS: Record<PlanPreviewLocale, Record<BadgeTag, string>> = {
  en: {
    none: "",
    start_here: "Start Here",
    best_value: "Best Value",
    most_popular: "Most Popular",
    limited: "Limited",
    vip: "VIP",
  },
  ar: {
    none: "",
    start_here: "ابدأ هنا",
    best_value: "أفضل قيمة",
    most_popular: "الأكثر شعبية",
    limited: "محدود",
    vip: "VIP",
  },
};

export const PLAN_PREVIEW_COPY = {
  en: {
    perMonth: "per month",
    perYear: "per year",
    savePercent: (pct: number) => `Save ${pct}%`,
    noFeaturesYet: "No features added yet",
    checklistItem: "Checklist item",
    selectPlan: "Select Plan",
    joinVip: "Join VIP",
    securePayment: "Secure payment · Powered by Stripe",
    draftInactive: "Draft / Inactive",
    noPlansToPreview: "No plans to preview",
  },
  ar: {
    perMonth: "شهريًا",
    perYear: "سنويًا",
    savePercent: (pct: number) => `وفّر ${pct}%`,
    noFeaturesYet: "لم تُضف ميزات بعد",
    checklistItem: "عنصر قائمة",
    selectPlan: "اختر الخطة",
    joinVip: "انضم إلى VIP",
    securePayment: "دفع آمن · مدعوم من Stripe",
    draftInactive: "مسودة / غير نشطة",
    noPlansToPreview: "لا توجد خطط للمعاينة",
  },
} as const;

export function getPlanPreviewLocale(useArabic: boolean): PlanPreviewLocale {
  return useArabic ? "ar" : "en";
}
