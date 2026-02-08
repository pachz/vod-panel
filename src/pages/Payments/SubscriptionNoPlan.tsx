import { XCircle } from "lucide-react";
import { BillingCycleChoice } from "./BillingCycleChoice";
import type { PaymentSettings } from "./usePayments";

type SubscriptionNoPlanProps = {
  paymentSettings: PaymentSettings | null | undefined;
  isLoading: boolean;
  isRTL: boolean;
  t: (key: string) => string;
  translateInterval: (interval: string) => string;
  onSubscribe: (priceId?: string) => void;
};

export function SubscriptionNoPlan({
  paymentSettings,
  isLoading,
  isRTL,
  t,
  translateInterval,
  onSubscribe,
}: SubscriptionNoPlanProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <XCircle className="h-5 w-5 shrink-0" />
        <p>{t("noActiveSubscription")}</p>
      </div>
      {paymentSettings ? (
        <BillingCycleChoice
          paymentSettings={paymentSettings}
          isLoading={isLoading}
          t={t}
          translateInterval={translateInterval}
          onSubscribe={onSubscribe}
          variant="compact"
          isRTL={isRTL}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("noProductConfigured")}</p>
      )}
    </div>
  );
}
