import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/pages/Payments/utils";
import type { PackagePlan } from "./PackagePlansGrid";
import { PLAN_BADGE_LABELS, getPlanPreviewLocale } from "../../../shared/planPreviewCopy";

type PackagePlanCompactListProps = {
  plans: PackagePlan[];
  useArabic: boolean;
  isUpgradeMode: boolean;
  isProcessing: boolean;
  processingPlanId: PackagePlan["_id"] | null;
  onSelectPlan: (planId: PackagePlan["_id"]) => void;
  subscribeLabel: string;
  upgradeLabel: string;
  currentPlanLabel: string;
  unavailableLabel: string;
};

export function PackagePlanCompactList({
  plans,
  useArabic,
  isUpgradeMode,
  isProcessing,
  processingPlanId,
  onSelectPlan,
  subscribeLabel,
  upgradeLabel,
  currentPlanLabel,
  unavailableLabel,
}: PackagePlanCompactListProps) {
  const locale = getPlanPreviewLocale(useArabic);
  const badgeLabels = PLAN_BADGE_LABELS[locale];

  return (
    <ul className="max-h-[min(320px,40vh)] space-y-2 overflow-y-auto pr-1">
      {plans.map((plan) => {
        const displayName = useArabic ? plan.name_ar || plan.name : plan.name;
        const badgeLabel = badgeLabels[plan.badgeTag];
        const priceLabel = formatPrice(plan.priceAmount, plan.priceCurrency).replace(/\.00$/, "");
        const subtitle = useArabic
          ? plan.priceSubtitle_ar?.trim() || plan.priceSubtitle?.trim()
          : plan.priceSubtitle?.trim();
        const isDisabled = plan.isCurrentPlan || plan.isAtCapacity || isProcessing;
        const actionLabel = plan.isCurrentPlan
          ? currentPlanLabel
          : plan.isAtCapacity
            ? unavailableLabel
            : isUpgradeMode
              ? upgradeLabel
              : subscribeLabel;
        const isLoading = processingPlanId === plan._id;

        return (
          <li key={plan._id}>
            <div
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card/80 p-3 transition-colors",
                plan.isCurrentPlan && "border-primary/40 bg-primary/5",
                !plan.isCurrentPlan && !isDisabled && "hover:border-primary/30",
              )}
              style={{ borderColor: plan.isCurrentPlan ? plan.theme.primary : undefined }}
            >
              <div
                className="h-12 w-1 shrink-0 rounded-full"
                style={{ background: plan.theme.primary }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-sm">{displayName}</span>
                  {badgeLabel ? (
                    <Badge
                      className="text-[10px] uppercase tracking-wide text-white"
                      style={{ background: plan.theme.primary }}
                    >
                      {badgeLabel}
                    </Badge>
                  ) : null}
                  {plan.isCurrentPlan ? (
                    <Badge variant="outline" className="text-[10px]">
                      {currentPlanLabel}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {subtitle ??
                    (plan.billingInterval === "month"
                      ? locale === "ar"
                        ? "شهريًا"
                        : "Billed monthly"
                      : locale === "ar"
                        ? "سنويًا"
                        : "Billed yearly")}
                </p>
                {plan.courseStats ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {plan.courseStats.courses}{" "}
                    {locale === "ar" ? "برامج" : "courses"} · {plan.courseStats.lessons}{" "}
                    {locale === "ar" ? "درس" : "lessons"}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-base font-bold tabular-nums" style={{ color: plan.theme.primary }}>
                  {priceLabel}
                </span>
                <Button
                  variant="cta"
                  size="sm"
                  className="h-8 min-w-[88px] text-xs"
                  disabled={isDisabled}
                  onClick={() => onSelectPlan(plan._id)}
                >
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : actionLabel}
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
