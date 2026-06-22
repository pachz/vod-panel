import { cn } from "@/lib/utils";
import { formatPrice } from "@/pages/Payments/utils";
import { getPlanIcon, BADGE_TAG_LABELS, type BadgeTag } from "./planIcons";
import type { PlanTheme } from "../../../shared/validation/plan";

export type PlanPreviewFeature = {
  icon: string;
  title: string;
  title_ar?: string;
  subtitle?: string;
  subtitle_ar?: string;
  isChecklistItem: boolean;
  displayOrder: number;
};

export type PlanPreviewData = {
  name: string;
  name_ar: string;
  billingInterval: "month" | "year";
  priceAmount: number;
  priceCurrency: string;
  compareAtPriceAmount?: number;
  priceSubtitle?: string;
  theme: PlanTheme;
  badgeTag: BadgeTag;
  ribbonText?: string;
  inheritsDescription?: string;
  inheritsDescription_ar?: string;
  features: PlanPreviewFeature[];
  isActive?: boolean;
};

type PlanPreviewCardProps = {
  plan: PlanPreviewData;
  isRTL?: boolean;
  useArabic?: boolean;
  className?: string;
  showFooter?: boolean;
};

function savingsPercent(current: number, compareAt: number): number | null {
  if (compareAt <= current) return null;
  return Math.round(((compareAt - current) / compareAt) * 100);
}

export function PlanPreviewCard({
  plan,
  isRTL = false,
  useArabic = false,
  className,
  showFooter = true,
}: PlanPreviewCardProps) {
  const displayName = useArabic ? plan.name_ar || plan.name : plan.name;
  const intervalLabel = plan.billingInterval === "month" ? "per month" : "per year";
  const badgeLabel = BADGE_TAG_LABELS[plan.badgeTag];
  const sortedFeatures = [...plan.features].sort((a, b) => a.displayOrder - b.displayOrder);
  const savePct =
    plan.compareAtPriceAmount != null
      ? savingsPercent(plan.priceAmount, plan.compareAtPriceAmount)
      : null;

  const isHighlighted = plan.badgeTag === "most_popular" || plan.badgeTag === "best_value";

  return (
    <div
      className={cn("relative mx-auto w-full max-w-[340px]", className)}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div
        className="relative flex flex-col overflow-hidden rounded-2xl border-2 bg-card shadow-lg"
        style={{ borderColor: plan.theme.border }}
      >
      {plan.ribbonText && (
        <div
          className={cn(
            "pointer-events-none absolute z-10 whitespace-nowrap py-1.5 text-center text-[9px] font-bold uppercase leading-none tracking-[0.14em] text-white shadow-sm",
            isRTL ? "-left-[3.25rem]" : "-right-[3.25rem]",
          )}
          style={{
            background: plan.theme.primary,
            width: "12.5rem",
            top: "2rem",
            transform: isRTL ? "rotate(-45deg)" : "rotate(45deg)",
          }}
        >
          {plan.ribbonText}
        </div>
      )}

      <div
        className={cn(
          "px-6 pb-5 text-center",
          badgeLabel ? (plan.ribbonText ? "pt-4" : "pt-3") : plan.ribbonText ? "pt-5" : "pt-4",
        )}
        style={{
          background: isHighlighted
            ? `linear-gradient(135deg, ${plan.theme.headerBg}, ${plan.theme.secondary}22)`
            : plan.theme.headerBg,
        }}
      >
        {badgeLabel && (
          <div className="mb-3 flex justify-center">
            <span
              className="rounded-full px-3 py-0.5 text-xs font-semibold text-white"
              style={{ background: plan.theme.primary }}
            >
              {badgeLabel}
            </span>
          </div>
        )}
        <h3 className="text-xl font-bold tracking-tight">{displayName}</h3>
        <div className="mt-3 flex flex-wrap items-baseline justify-center gap-2">
          {plan.compareAtPriceAmount != null && plan.compareAtPriceAmount > plan.priceAmount && (
            <span className="text-lg text-muted-foreground line-through">
              {formatPrice(plan.compareAtPriceAmount, plan.priceCurrency)}
            </span>
          )}
          <span className="text-4xl font-bold" style={{ color: plan.theme.primary }}>
            {formatPrice(plan.priceAmount, plan.priceCurrency).replace(/\.00$/, "")}
          </span>
          {savePct != null && savePct > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
              style={{ background: plan.theme.secondary }}
            >
              Save {savePct}%
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {plan.priceSubtitle ?? intervalLabel}
        </p>
      </div>

      <div className="flex-1 px-5 py-4">
        {(useArabic
          ? plan.inheritsDescription_ar?.trim() || plan.inheritsDescription?.trim()
          : plan.inheritsDescription?.trim()) && (
          <p className="mb-3 text-xs font-medium text-muted-foreground">
            {useArabic
              ? plan.inheritsDescription_ar?.trim() || plan.inheritsDescription
              : plan.inheritsDescription}
          </p>
        )}
        {sortedFeatures.length > 0 ? (
          <ul className="space-y-3">
            {sortedFeatures.map((feature, index) => {
              const Icon = getPlanIcon(feature.icon);
              const title = useArabic ? feature.title_ar || feature.title : feature.title;
              const subtitleRaw = useArabic
                ? feature.subtitle_ar || feature.subtitle
                : feature.subtitle;
              const subtitle = subtitleRaw?.trim() ? subtitleRaw : undefined;
              const hasExtraLines = Boolean(subtitle) || feature.isChecklistItem;
              return (
                <li
                  key={`${feature.icon}-${index}`}
                  className={cn("flex gap-3", hasExtraLines ? "items-start" : "items-center")}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      hasExtraLines && "mt-0.5",
                    )}
                    style={{ background: `${plan.theme.primary}18`, color: plan.theme.primary }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{title}</p>
                    {subtitle && (
                      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                    )}
                    {feature.isChecklistItem && (
                      <span className="mt-1 inline-block text-[10px] uppercase tracking-wide text-muted-foreground">
                        Checklist item
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No features added yet</p>
        )}
      </div>

      {showFooter && (
        <div className="px-5 pb-5 pt-2">
          <button
            type="button"
            className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: plan.theme.buttonBg }}
            disabled
          >
            {plan.badgeTag === "vip" ? "Join VIP" : "Select Plan"}
          </button>
          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            Secure payment · Powered by Stripe
          </p>
        </div>
      )}

      {plan.isActive === false && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <span className="rounded-lg bg-muted px-3 py-1 text-sm font-medium">Draft / Inactive</span>
        </div>
      )}
      </div>
    </div>
  );
}

type PlanPreviewRowProps = {
  plans: PlanPreviewData[];
  highlightIndex?: number;
  isRTL?: boolean;
};

export function PlanPreviewRow({ plans, highlightIndex, isRTL }: PlanPreviewRowProps) {
  if (plans.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground text-sm">
        No plans to preview
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((plan, index) => (
        <PlanPreviewCard
          key={`${plan.name}-${index}`}
          plan={plan}
          isRTL={isRTL}
          className={cn(
            highlightIndex === index && "ring-2 ring-primary ring-offset-2 scale-[1.02]",
          )}
        />
      ))}
    </div>
  );
}
