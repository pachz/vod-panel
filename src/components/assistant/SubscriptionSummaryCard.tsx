import { useEffect } from "react";
import { format } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { translate, useLanguage, type Language, type TranslationKey } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { cn } from "@/lib/utils";
import { BillingPortalButton } from "./BillingPortalButton";
import type { SubscriptionToolResult } from "./types";

type SubscriptionSummaryCardProps = {
  subscription: SubscriptionToolResult;
  billingPortalUrl?: string | null;
  contentLanguage?: Language;
};

const STATUS_KEYS = {
  active: "assistantSubscriptionStatusActive",
  trialing: "assistantSubscriptionStatusTrialing",
  past_due: "assistantSubscriptionStatusPastDue",
  canceled: "assistantSubscriptionStatusCanceled",
  paused: "assistantSubscriptionStatusPaused",
  none: "assistantSubscriptionStatusNone",
} as const satisfies Record<SubscriptionToolResult["status"], TranslationKey>;

export function SubscriptionSummaryCard({
  subscription,
  billingPortalUrl,
  contentLanguage,
}: SubscriptionSummaryCardProps) {
  const { language } = useLanguage();
  const displayLanguage = contentLanguage ?? language;
  const isRtl = displayLanguage === "ar";

  useEffect(() => {
    trackPosthogEvent("assistant_subscription_card_viewed", {
      status: subscription.status,
    });
  }, [subscription.status]);

  const planName =
    displayLanguage === "ar"
      ? subscription.planNameAr ?? subscription.planNameEn
      : subscription.planNameEn ?? subscription.planNameAr;

  const statusLabel = translate(displayLanguage, STATUS_KEYS[subscription.status]);
  const dateLocale = displayLanguage === "ar" ? arSA : enUS;
  const renewalDate =
    subscription.currentPeriodEnd !== undefined
      ? format(new Date(subscription.currentPeriodEnd), "PPP", { locale: dateLocale })
      : null;

  return (
    <Card
      className={cn("border-border/60 bg-card/80", isRtl && "assistant-rtl text-right")}
      dir={isRtl ? "rtl" : "ltr"}
      lang={displayLanguage}
    >
      <CardHeader>
        <CardTitle className={cn("text-lg", isRtl && "text-right")}>
          {translate(displayLanguage, "assistantSubscriptionTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">
            {translate(displayLanguage, "assistantSubscriptionPlan")}
          </span>
          <span className="font-medium">
            {planName ?? translate(displayLanguage, "assistantSubscriptionNone")}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">
            {translate(displayLanguage, "assistantSubscriptionStatusLabel")}
          </span>
          <span className="font-medium">{statusLabel}</span>
        </div>
        {renewalDate ? (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">
              {translate(displayLanguage, "assistantSubscriptionRenewal")}
            </span>
            <span className="font-medium">{renewalDate}</span>
          </div>
        ) : null}
        {subscription.cancelAtPeriodEnd ? (
          <p className="text-muted-foreground">
            {translate(displayLanguage, "assistantSubscriptionCancelScheduled")}
          </p>
        ) : null}
        {billingPortalUrl ? (
          <BillingPortalButton
            url={billingPortalUrl}
            label={translate(displayLanguage, "assistantManageSubscription")}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
