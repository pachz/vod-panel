import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "./utils";
import type { CycleInfo } from "./utils";
import type { Subscription } from "./usePayments";

type BillingCycleSectionProps = {
  subscription: Subscription;
  cycleInfo: CycleInfo | null;
  validPeriodDates: boolean;
  isReSyncing: boolean;
  isRTL: boolean;
  t: (key: string) => string;
  translateInterval?: (interval: string) => string;
  onReSync: () => void;
};

export function BillingCycleSection({
  subscription,
  cycleInfo,
  validPeriodDates,
  isReSyncing,
  isRTL,
  t,
  translateInterval,
  onReSync,
}: BillingCycleSectionProps) {
  if (!validPeriodDates) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-sm font-medium text-yellow-500 mb-2">{t("subscriptionDataNeedsSync")}</p>
          <p className="text-sm text-muted-foreground mb-3">{t("subscriptionDatesInvalid")}</p>
          <Button variant="outline" size="sm" onClick={onReSync} disabled={isReSyncing}>
            {isReSyncing ? (
              <>
                <Loader2 className={cn("h-4 w-4 animate-spin", isRTL ? "ml-2" : "mr-2")} />
                {t("syncing")}
              </>
            ) : (
              <>
                <RefreshCw className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                {t("syncFromStripe")}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (!cycleInfo) return null;

  const intervalLabel =
    subscription.interval && translateInterval
      ? translateInterval(subscription.interval)
      : null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-3">{t("billingCycle")}</h3>
        {intervalLabel && (
          <p className="text-xs text-muted-foreground mb-2">
            {intervalLabel}
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("currentPeriod")}</p>
            <p className="text-sm font-medium">
              {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("daysRemaining")}</p>
            <p className="text-sm font-medium">
              {cycleInfo.daysRemaining} {cycleInfo.daysRemaining === 1 ? t("day") : t("days")}
            </p>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("cycleProgress")}</span>
            <span>{Math.round(cycleInfo.progress)}%</span>
          </div>
          <div className="relative h-2 bg-secondary/50 rounded-full overflow-hidden">
            <div
              className={cn(
                "absolute inset-y-0 bg-gradient-to-r from-primary to-primary-glow rounded-full transition-all duration-300",
                isRTL ? "right-0" : "left-0"
              )}
              style={{ width: `${cycleInfo.progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{cycleInfo.daysElapsed} {t("daysElapsed")}</span>
            <span>{cycleInfo.daysRemaining} {t("daysRemainingLabel")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
