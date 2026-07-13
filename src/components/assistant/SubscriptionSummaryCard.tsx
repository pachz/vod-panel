import { useEffect } from "react";
import { format } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { BillingPortalButton } from "./BillingPortalButton";
import type { SubscriptionToolResult } from "./types";

type SubscriptionSummaryCardProps = {
  subscription: SubscriptionToolResult;
  billingPortalUrl?: string | null;
};

function getSubscriptionStatusLabel(
  status: SubscriptionToolResult["status"],
  t: (key: "assistantSubscriptionStatusActive" | "assistantSubscriptionStatusTrialing" | "assistantSubscriptionStatusPastDue" | "assistantSubscriptionStatusCanceled" | "assistantSubscriptionStatusPaused" | "assistantSubscriptionStatusNone") => string,
) {
  switch (status) {
    case "active":
      return t("assistantSubscriptionStatusActive");
    case "trialing":
      return t("assistantSubscriptionStatusTrialing");
    case "past_due":
      return t("assistantSubscriptionStatusPastDue");
    case "canceled":
      return t("assistantSubscriptionStatusCanceled");
    case "paused":
      return t("assistantSubscriptionStatusPaused");
    default:
      return t("assistantSubscriptionStatusNone");
  }
}

export function SubscriptionSummaryCard({
  subscription,
  billingPortalUrl,
}: SubscriptionSummaryCardProps) {
  const { language, t } = useLanguage();

  useEffect(() => {
    trackPosthogEvent("assistant_subscription_card_viewed", {
      status: subscription.status,
    });
  }, [subscription.status]);

  const planName =
    language === "ar"
      ? subscription.planNameAr ?? subscription.planNameEn
      : subscription.planNameEn ?? subscription.planNameAr;

  const statusLabel = getSubscriptionStatusLabel(subscription.status, t);
  const dateLocale = language === "ar" ? arSA : enUS;
  const renewalDate =
    subscription.currentPeriodEnd !== undefined
      ? format(new Date(subscription.currentPeriodEnd), "PPP", { locale: dateLocale })
      : null;

  return (
    <Card className="border-border/60 bg-card/80">
      <CardHeader>
        <CardTitle className="text-lg">{t("assistantSubscriptionTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t("assistantSubscriptionPlan")}</span>
          <span className="font-medium">{planName ?? t("assistantSubscriptionNone")}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t("assistantSubscriptionStatusLabel")}</span>
          <span className="font-medium">{statusLabel}</span>
        </div>
        {renewalDate ? (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t("assistantSubscriptionRenewal")}</span>
            <span className="font-medium">{renewalDate}</span>
          </div>
        ) : null}
        {subscription.cancelAtPeriodEnd ? (
          <p className="text-muted-foreground">{t("assistantSubscriptionCancelScheduled")}</p>
        ) : null}
        {billingPortalUrl ? (
          <BillingPortalButton url={billingPortalUrl} label={t("assistantManageSubscription")} />
        ) : null}
      </CardContent>
    </Card>
  );
}
