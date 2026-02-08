import { CheckCircle2, ExternalLink, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatDate } from "./utils";
import { BillingCycleSection } from "./BillingCycleSection";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import type { Subscription } from "./usePayments";
import type { CycleInfo } from "./utils";

type SubscriptionActiveProps = {
  subscription: Subscription;
  effectiveStatus: string;
  cycleInfo: CycleInfo | null;
  validPeriodDates: boolean;
  isReactivating: boolean;
  isOpeningPortal: boolean;
  isReSyncing: boolean;
  isRTL: boolean;
  t: (key: string) => string;
  onReactivate: () => void;
  onOpenPortal: () => void;
  onReSync: () => void;
};

export function SubscriptionActive({
  subscription,
  effectiveStatus,
  cycleInfo,
  validPeriodDates,
  isReactivating,
  isOpeningPortal,
  isReSyncing,
  isRTL,
  t,
  onReactivate,
  onOpenPortal,
  onReSync,
}: SubscriptionActiveProps) {
  const isExpired = effectiveStatus === "expired";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isExpired ? (
            <XCircle className="h-5 w-5 text-muted-foreground" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          )}
          <span className="font-medium">
            {isExpired ? t("subscriptionExpired") : t("subscriptionActive")}
          </span>
        </div>
        <PaymentStatusBadge status={effectiveStatus} t={t} />
      </div>

      <Separator />

      <BillingCycleSection
        subscription={subscription}
        cycleInfo={cycleInfo}
        validPeriodDates={validPeriodDates}
        isReSyncing={isReSyncing}
        isRTL={isRTL}
        t={t}
        onReSync={onReSync}
      />

      {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
        <>
          <Separator />
          <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <XCircle className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-500">{t("scheduledForCancellation")}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("subscriptionEndsOn")}{" "}
                <span className="font-medium">{formatDate(subscription.currentPeriodEnd)}</span>.{" "}
                {t("canReactivateAnytime")}
              </p>
            </div>
          </div>
        </>
      )}

      <Separator />

      <div className="flex flex-col sm:flex-row gap-3">
        {subscription.cancelAtPeriodEnd && (
          <Button
            variant="outline"
            onClick={onReactivate}
            disabled={isReactivating}
            className="flex-1"
          >
            <RefreshCw
              className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2", isReactivating && "animate-spin")}
            />
            {isReactivating ? t("reactivating") : t("reactivateSubscription")}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={onOpenPortal}
          disabled={isOpeningPortal}
          className="flex-1"
        >
          <ExternalLink className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
          {isOpeningPortal ? t("opening") : t("manageInStripe")}
        </Button>
      </div>

      <div className="text-xs text-muted-foreground pt-2 border-t">
        <p>{t("manageInStripeDescription")}</p>
      </div>
    </div>
  );
}
