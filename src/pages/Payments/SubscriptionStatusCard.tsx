import { CreditCard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubscriptionNoPlan } from "./SubscriptionNoPlan";
import { SubscriptionActive } from "./SubscriptionActive";
import type { Subscription } from "./usePayments";
import type { PaymentSettings } from "./usePayments";
import type { CycleInfo } from "./utils";

type SubscriptionStatusCardProps = {
  subscription: Subscription | null | undefined;
  paymentSettings: PaymentSettings | null | undefined;
  isSyncing: boolean;
  effectiveStatus: string;
  cycleInfo: CycleInfo | null;
  validPeriodDates: boolean;
  isLoading: boolean;
  isReactivating: boolean;
  isOpeningPortal: boolean;
  isReSyncing: boolean;
  isRTL: boolean;
  t: (key: string) => string;
  translateInterval: (interval: string) => string;
  onSubscribe: () => void;
  onReactivate: () => void;
  onOpenPortal: () => void;
  onReSync: () => void;
};

export function SubscriptionStatusCard({
  subscription,
  paymentSettings,
  isSyncing,
  effectiveStatus,
  cycleInfo,
  validPeriodDates,
  isLoading,
  isReactivating,
  isOpeningPortal,
  isReSyncing,
  isRTL,
  t,
  translateInterval,
  onSubscribe,
  onReactivate,
  onOpenPortal,
  onReSync,
}: SubscriptionStatusCardProps) {
  if (subscription === undefined) return null;

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {t("subscriptionStatusTitle")}
          {isSyncing && (
            <Badge variant="outline" className="text-xs">
              {t("syncing")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{t("yourSubscriptionInfo")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isSyncing ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p>{t("syncingSubscriptionStatus")}</p>
          </div>
        ) : subscription === null ? (
          <SubscriptionNoPlan
            paymentSettings={paymentSettings}
            isLoading={isLoading}
            isRTL={isRTL}
            t={t}
            translateInterval={translateInterval}
            onSubscribe={onSubscribe}
          />
        ) : (
          <SubscriptionActive
            subscription={subscription}
            effectiveStatus={effectiveStatus}
            cycleInfo={cycleInfo}
            validPeriodDates={validPeriodDates}
            isReactivating={isReactivating}
            isOpeningPortal={isOpeningPortal}
            isReSyncing={isReSyncing}
            isRTL={isRTL}
            t={t}
            translateInterval={translateInterval}
            onReactivate={onReactivate}
            onOpenPortal={onOpenPortal}
            onReSync={onReSync}
          />
        )}
      </CardContent>
    </Card>
  );
}
