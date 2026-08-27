import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { pathForLanguage, translate, useLanguage, type Language } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/pages/Payments/utils";
import type { ActiveSubscriptionPlan } from "./types";

type SubscriptionPlanCardProps = {
  plan: ActiveSubscriptionPlan;
  contentLanguage?: Language;
};

export function SubscriptionPlanCard({ plan, contentLanguage }: SubscriptionPlanCardProps) {
  const { language } = useLanguage();
  const displayLanguage = contentLanguage ?? language;
  const isRtl = displayLanguage === "ar";
  const paymentsUrl = pathForLanguage("/payments", displayLanguage);

  const name = displayLanguage === "ar" ? plan.nameAr || plan.nameEn : plan.nameEn || plan.nameAr;
  const subtitle =
    displayLanguage === "ar"
      ? plan.priceSubtitleAr?.trim() || plan.priceSubtitleEn?.trim()
      : plan.priceSubtitleEn?.trim() || plan.priceSubtitleAr?.trim();
  const features =
    displayLanguage === "ar"
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
      ? translate(displayLanguage, "assistantPlanBilledMonthly")
      : translate(displayLanguage, "assistantPlanBilledYearly");

  const statsParts: string[] = [];
  if (plan.courseCount !== undefined) {
    statsParts.push(`${plan.courseCount} ${translate(displayLanguage, "assistantPlanCourses")}`);
  }
  if (plan.lessonCount !== undefined) {
    statsParts.push(`${plan.lessonCount} ${translate(displayLanguage, "assistantPlanLessons")}`);
  }
  if (plan.hours !== undefined) {
    statsParts.push(`${plan.hours} ${translate(displayLanguage, "assistantPlanHours")}`);
  }

  return (
    <Card
      className={cn("border-border/60 bg-card/80", isRtl && "assistant-rtl text-right")}
      dir={isRtl ? "rtl" : "ltr"}
      lang={displayLanguage}
    >
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {plan.isCurrentPlan ? (
            <Badge variant="default">{translate(displayLanguage, "assistantPlanCurrent")}</Badge>
          ) : null}
          {plan.isAtCapacity ? (
            <Badge variant="secondary">{translate(displayLanguage, "assistantPlanAtCapacity")}</Badge>
          ) : null}
          <Badge variant="outline">{intervalLabel}</Badge>
        </div>
        <CardTitle className={cn("text-lg leading-snug", isRtl && "text-right")}>{name}</CardTitle>
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
            {translate(displayLanguage, "assistantViewPlans")}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
