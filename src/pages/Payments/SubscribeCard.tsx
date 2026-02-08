import { CreditCard } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingCycleChoice } from "./BillingCycleChoice";
import { formatPrice } from "./utils";
import type { PaymentSettings } from "./usePayments";

type SubscribeCardProps = {
  paymentSettings: PaymentSettings | null | undefined;
  isLoading: boolean;
  isRTL: boolean;
  t: (key: string) => string;
  translateInterval: (interval: string) => string;
  onSubscribe: (priceId?: string) => void;
};

export function SubscribeCard({
  paymentSettings,
  isLoading,
  isRTL,
  t,
  translateInterval,
  onSubscribe,
}: SubscribeCardProps) {
  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          {paymentSettings ? t("subscribe") : t("testSubscription")}
        </CardTitle>
        <CardDescription>
          {paymentSettings
            ? t("subscribeToProduct")
                .replace("{productName}", paymentSettings.productName)
                .replace("{price}", formatPrice(paymentSettings.monthlyPriceAmount, paymentSettings.monthlyPriceCurrency))
                .replace("{interval}", translateInterval(paymentSettings.priceInterval))
            : t("testStripePaymentFlow")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
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
      </CardContent>
    </Card>
  );
}
