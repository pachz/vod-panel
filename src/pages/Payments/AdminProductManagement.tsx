import { Loader2, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatPrice } from "./utils";
import type { PaymentSettings, StripeProduct, StripePrice } from "./usePayments";

type AdminProductManagementProps = {
  paymentSettings: PaymentSettings | null | undefined;
  stripeProducts: StripeProduct[] | null;
  selectedProductId: string;
  setSelectedProductId: (id: string) => void;
  selectedMonthlyPriceId: string;
  setSelectedMonthlyPriceId: (id: string) => void;
  selectedYearlyPriceId: string;
  setSelectedYearlyPriceId: (id: string) => void;
  monthlyPrices: StripePrice[];
  yearlyPrices: StripePrice[];
  isFetchingProducts: boolean;
  isSavingSettings: boolean;
  isRTL: boolean;
  t: (key: string) => string;
  translateInterval: (interval: string) => string;
  onFetchProducts: () => void;
  onSaveSettings: () => void;
};

export function AdminProductManagement({
  paymentSettings,
  stripeProducts,
  selectedProductId,
  setSelectedProductId,
  selectedMonthlyPriceId,
  setSelectedMonthlyPriceId,
  selectedYearlyPriceId,
  setSelectedYearlyPriceId,
  monthlyPrices,
  yearlyPrices,
  isFetchingProducts,
  isSavingSettings,
  isRTL,
  t,
  translateInterval,
  onFetchProducts,
  onSaveSettings,
}: AdminProductManagementProps) {
  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t("productPriceManagement")}
          <Badge variant="outline" className="text-xs">
            {t("adminOnly")}
          </Badge>
        </CardTitle>
        <CardDescription>{t("configureStripeProduct")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {paymentSettings && (
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm font-medium mb-1">{t("currentConfiguration")}</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                <span className="font-medium">{t("product")}:</span> {paymentSettings.productName}
              </p>
              <p>
                <span className="font-medium">{t("monthlyPrice")}:</span>{" "}
                {formatPrice(paymentSettings.monthlyPriceAmount, paymentSettings.monthlyPriceCurrency)} / {t("monthly")}
              </p>
              {paymentSettings.selectedYearlyPriceId && (
                <p>
                  <span className="font-medium">{t("yearlyPrice")}:</span>{" "}
                  {formatPrice(
                    paymentSettings.yearlyPriceAmount ?? 0,
                    paymentSettings.yearlyPriceCurrency ?? "usd"
                  )}{" "}
                  / {t("yearly")}
                </p>
              )}
            </div>
          </div>
        )}

        <div>
          <Button
            variant="outline"
            onClick={onFetchProducts}
            disabled={isFetchingProducts}
            className="w-full sm:w-auto"
          >
            {isFetchingProducts ? (
              <>
                <Loader2 className={cn("h-4 w-4 animate-spin", isRTL ? "ml-2" : "mr-2")} />
                {t("fetchingFromStripe")}
              </>
            ) : (
              <>
                <RefreshCw className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                {t("fetchProductsFromStripe")}
              </>
            )}
          </Button>
        </div>

        {stripeProducts && stripeProducts.length > 0 && (
          <div className="space-y-4 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="product-select">{t("selectProduct")}</Label>
              <Select
                value={selectedProductId}
                onValueChange={(value) => {
                  setSelectedProductId(value);
                  setSelectedMonthlyPriceId("");
                  setSelectedYearlyPriceId("");
                }}
              >
                <SelectTrigger id="product-select">
                  <SelectValue placeholder={t("chooseProduct")} />
                </SelectTrigger>
                <SelectContent>
                  {stripeProducts.map((product) => {
                    const activePrices =
                      product.prices?.filter((p) => p.active && p.type === "recurring") ?? [];
                    const priceDisplay =
                      activePrices.length > 0
                        ? activePrices
                            .map((price) => {
                              const formatted = formatPrice(price.unitAmount, price.currency);
                              const interval = price.recurring?.interval ?? "one-time";
                              const intervalCount = price.recurring?.intervalCount;
                              const intervalText =
                                intervalCount && intervalCount > 1
                                  ? `every ${intervalCount} ${interval}s`
                                  : interval;
                              return `${formatted} / ${translateInterval(intervalText)}`;
                            })
                            .join(", ")
                        : t("noActivePrices");
                    const displayText = product.description
                      ? `${product.name} - ${product.description} (${priceDisplay})`
                      : `${product.name} (${priceDisplay})`;
                    return (
                      <SelectItem key={product.id} value={product.id}>
                        {displayText}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {selectedProductId && (
              <div className="space-y-2">
                <Label htmlFor="monthly-price-select">{t("selectMonthlyPrice")}</Label>
                <Select
                  value={selectedMonthlyPriceId}
                  onValueChange={setSelectedMonthlyPriceId}
                >
                  <SelectTrigger id="monthly-price-select">
                    <SelectValue placeholder={t("chooseMonthlyPrice")} />
                  </SelectTrigger>
                  <SelectContent>
                    {monthlyPrices.map((price) => (
                      <SelectItem key={price.id} value={price.id}>
                        {formatPrice(price.unitAmount, price.currency)} / {t("monthly")}
                        {price.recurring?.intervalCount && price.recurring.intervalCount > 1 &&
                          ` (every ${price.recurring.intervalCount})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProductId && monthlyPrices.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t("noMonthlyPrices")}</p>
                )}
              </div>
            )}

            {selectedProductId && (
              <div className="space-y-2">
                <Label htmlFor="yearly-price-select">
                  {t("selectYearlyPrice")} ({t("optional")})
                </Label>
                <Select
                  value={selectedYearlyPriceId || "__none__"}
                  onValueChange={(value) => setSelectedYearlyPriceId(value === "__none__" ? "" : value)}
                >
                  <SelectTrigger id="yearly-price-select">
                    <SelectValue placeholder={t("chooseYearlyPrice")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("none")}</SelectItem>
                    {yearlyPrices.map((price) => (
                      <SelectItem key={price.id} value={price.id}>
                        {formatPrice(price.unitAmount, price.currency)} / {t("yearly")}
                        {price.recurring?.intervalCount && price.recurring.intervalCount > 1 &&
                          ` (every ${price.recurring.intervalCount})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProductId && yearlyPrices.length === 0 && selectedYearlyPriceId && (
                  <p className="text-xs text-muted-foreground">{t("noYearlyPrices")}</p>
                )}
              </div>
            )}

            {selectedProductId && monthlyPrices.length === 0 && yearlyPrices.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("noActiveRecurringPrices")}</p>
            )}

            {selectedProductId && selectedMonthlyPriceId && (
              <Button
                variant="cta"
                onClick={onSaveSettings}
                disabled={isSavingSettings}
                className="w-full sm:w-auto"
              >
                {isSavingSettings ? (
                  <>
                    <Loader2 className={cn("h-4 w-4 animate-spin", isRTL ? "ml-2" : "mr-2")} />
                    {t("saving")}
                  </>
                ) : (
                  t("saveConfiguration")
                )}
              </Button>
            )}
          </div>
        )}

        {stripeProducts && stripeProducts.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("noActiveProducts")}</p>
        )}
      </CardContent>
    </Card>
  );
}
