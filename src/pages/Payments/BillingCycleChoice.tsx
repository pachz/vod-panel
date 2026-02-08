import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPrice } from "./utils";
import type { PaymentSettings } from "./usePayments";

type BillingCycleChoiceProps = {
  paymentSettings: PaymentSettings | null | undefined;
  isLoading: boolean;
  t: (key: string) => string;
  translateInterval: (interval: string) => string;
  onSubscribe: (priceId?: string) => void;
  subscribeLabel?: string;
  variant?: "default" | "compact";
  isRTL?: boolean;
};

export function BillingCycleChoice({
  paymentSettings,
  isLoading,
  t,
  translateInterval,
  onSubscribe,
  subscribeLabel,
  variant = "default",
  isRTL = false,
}: BillingCycleChoiceProps) {
  const hasYearly = !!(paymentSettings?.selectedYearlyPriceId && paymentSettings?.yearlyPriceAmount != null);
  const monthlyPriceId = paymentSettings?.selectedMonthlyPriceId;
  const yearlyPriceId = paymentSettings?.selectedYearlyPriceId ?? null;

  const [selectedCycle, setSelectedCycle] = useState<"monthly" | "yearly">("monthly");

  const selectedPriceId = selectedCycle === "yearly" && yearlyPriceId ? yearlyPriceId : monthlyPriceId;

  const handleSubscribe = () => {
    onSubscribe(selectedPriceId || undefined);
  };

  if (!paymentSettings) {
    return null;
  }

  const monthlyAmount = formatPrice(
    paymentSettings.monthlyPriceAmount,
    paymentSettings.monthlyPriceCurrency
  );
  const yearlyAmount =
    hasYearly && paymentSettings.yearlyPriceAmount != null && paymentSettings.yearlyPriceCurrency
      ? formatPrice(paymentSettings.yearlyPriceAmount, paymentSettings.yearlyPriceCurrency)
      : null;

  const defaultSubscribeLabel = t("subscribe");
  const label = subscribeLabel ?? defaultSubscribeLabel;

  if (!hasYearly) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
          <p className="text-sm font-medium">{t("monthly")}</p>
          <p className="text-lg font-semibold text-foreground">
            {monthlyAmount}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}/ {translateInterval("month")}
            </span>
          </p>
        </div>
        <Button
          variant="cta"
          onClick={handleSubscribe}
          disabled={isLoading || !monthlyPriceId}
          className="w-full sm:w-auto"
        >
          {isLoading ? t("creatingCheckoutSession") : label}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {t("chooseBillingCycle")}
      </p>
      <div
        className={cn(
          "grid gap-3",
          variant === "compact" ? "grid-cols-2" : "sm:grid-cols-2"
        )}
      >
        <button
          type="button"
          onClick={() => setSelectedCycle("monthly")}
          className={cn(
            "relative flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all",
            "hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selectedCycle === "monthly"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border/60 bg-muted/20 hover:bg-muted/30"
          )}
        >
          {selectedCycle === "monthly" && (
            <div
              className={cn(
                "absolute flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground",
                isRTL ? "left-3 top-3" : "right-3 top-3"
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </div>
          )}
          <span className="text-sm font-medium text-muted-foreground">
            {translateInterval("month")}
          </span>
          <span className="mt-1 text-xl font-bold text-foreground">{monthlyAmount}</span>
          <span className="text-xs text-muted-foreground">
            {t("per")} {translateInterval("month")}
          </span>
          <span className="mt-2 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            {t("mostPopular")}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedCycle("yearly")}
          className={cn(
            "relative flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all",
            "hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            selectedCycle === "yearly"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border/60 bg-muted/20 hover:bg-muted/30"
          )}
        >
          {selectedCycle === "yearly" && (
            <div
              className={cn(
                "absolute flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground",
                isRTL ? "left-3 top-3" : "right-3 top-3"
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </div>
          )}
          <span className="text-sm font-medium text-muted-foreground">
            {translateInterval("year")}
          </span>
          <span className="mt-1 text-xl font-bold text-foreground">
            {yearlyAmount ?? ""}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("per")} {translateInterval("year")}
          </span>
          <span className="mt-2 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            {t("bestValue")}
          </span>
        </button>
      </div>

      <Button
        variant="cta"
        onClick={handleSubscribe}
        disabled={isLoading || !selectedPriceId}
        className="w-full sm:w-auto"
      >
        {isLoading ? t("creatingCheckoutSession") : label}
      </Button>
    </div>
  );
}
