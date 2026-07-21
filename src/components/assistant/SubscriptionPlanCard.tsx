import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { formatPrice } from "@/pages/Payments/utils";
import type { ActiveSubscriptionPlan } from "./types";

type SubscriptionPlanCardProps = {
  plan: ActiveSubscriptionPlan;
};

export function SubscriptionPlanCard({ plan }: SubscriptionPlanCardProps) {
  const { language, t, localizedPath } = useLanguage();
  const paymentsUrl = localizedPath("/payments");

  const name = language === "ar" ? plan.nameAr || plan.nameEn : plan.nameEn || plan.nameAr;
  const subtitle =
    language === "ar"
      ? plan.priceSubtitleAr?.trim() || plan.priceSubtitleEn?.trim()
      : plan.priceSubtitleEn?.trim() || plan.priceSubtitleAr?.trim();
  const features =
    language === "ar"
      ? plan.featureTitlesAr.length > 0
        ? plan.featureTitlesAr
        : plan.featureTitlesEn
      : plan.featureTitlesEn.length > 0
        ? plan.featureTitlesEn
        : plan.featureTitlesAr;

  const priceLabel = formatPrice(plan.priceAmount, plan.priceCurrency).replace(/\.00$/, "");
  const compareAtLabel =
    plan.compareAtPriceAmount !== undefined
      ? formatPrice(plan.compareAtPriceAmount, plan.priceCurrency).replace(/\.00$/, "")
      : null;
  const intervalLabel =
    plan.billingInterval === "month"
      ? t("assistantPlanBilledMonthly")
      : t("assistantPlanBilledYearly");

  const statsParts: string[] = [];
  if (plan.courseCount !== undefined) {
    statsParts.push(`${plan.courseCount} ${t("assistantPlanCourses")}`);
  }
  if (plan.lessonCount !== undefined) {
    statsParts.push(`${plan.lessonCount} ${t("assistantPlanLessons")}`);
  }
  if (plan.hours !== undefined) {
    statsParts.push(`${plan.hours} ${t("assistantPlanHours")}`);
  }

  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {plan.isCurrentPlan ? (
            <Badge variant="default">{t("assistantPlanCurrent")}</Badge>
          ) : null}
          {plan.isAtCapacity ? (
            <Badge variant="secondary">{t("assistantPlanAtCapacity")}</Badge>
          ) : null}
          <Badge variant="outline">{intervalLabel}</Badge>
        </div>
        <CardTitle className="text-lg leading-snug">{name}</CardTitle>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-2xl font-semibold tracking-tight">{priceLabel}</span>
          {compareAtLabel ? (
            <span className="text-sm text-muted-foreground line-through">{compareAtLabel}</span>
          ) : null}
        </div>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {statsParts.length > 0 ? (
          <p className="text-xs text-muted-foreground">{statsParts.join(" · ")}</p>
        ) : null}
        {features.length > 0 ? (
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {features.slice(0, 4).map((feature) => (
              <li key={feature} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                <span className="leading-snug">{feature}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button asChild variant="cta" className="w-full sm:w-auto">
          <Link
            to={paymentsUrl}
            onClick={() => {
              trackPosthogEvent("assistant_plan_clicked", { planId: plan.id });
            }}
          >
            <ExternalLink className="h-4 w-4 me-2" />
            {t("assistantViewPlans")}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
