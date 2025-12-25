import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, CheckCircle2, XCircle, Calendar, ExternalLink, RefreshCw, Settings, Loader2 } from "lucide-react";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const Payments = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, isRTL, translateInterval } = useLanguage();
  const createCheckoutSession = useAction(api.payment.createCheckoutSession);
  const syncSubscriptionStatus = useAction(api.payment.syncSubscriptionStatus);
  const reactivateSubscription = useAction(api.payment.reactivateSubscription);
  const createCustomerPortalSession = useAction(api.payment.createCustomerPortalSession);
  const fetchStripeProducts = useAction(api.payment.fetchStripeProducts);
  const setPaymentSettings = useMutation(api.paymentInternal.setPaymentSettings);
  const syncSubscriptionFromStripe = useAction(api.payment.syncSubscriptionFromStripe);
  const subscription = useQuery(api.paymentInternal.getMySubscription);
  const currentUser = useQuery(api.user.getCurrentUser);
  const paymentSettings = useQuery(api.paymentInternal.getPaymentSettingsPublic);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isReSyncing, setIsReSyncing] = useState(false);
  
  // Admin product management state
  const [stripeProducts, setStripeProducts] = useState<any[] | null>(null);
  const [isFetchingProducts, setIsFetchingProducts] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedPriceId, setSelectedPriceId] = useState<string>("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const isAdmin = currentUser?.isGod ?? false;

  // Handle success/cancel redirects and sync subscription
  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    const sessionId = searchParams.get("session_id");

    if (success === "true" && sessionId) {
      // Sync subscription status from Stripe
      setIsSyncing(true);
      syncSubscriptionStatus({ sessionId })
        .then((result) => {
          if (result?.success) {
            toast.success(t("paymentSuccessfulActivated"));
          } else {
            toast.success(t("paymentSuccessfulActivating"));
          }
        })
        .catch((error) => {
          console.error("Error syncing subscription:", error);
          toast.error(t("paymentSuccessfulSyncFailed"));
        })
        .finally(() => {
          setIsSyncing(false);
          // Remove query params
          setSearchParams({});
        });
    } else if (canceled === "true") {
      toast.info(t("paymentCanceled"));
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, syncSubscriptionStatus]);

  const handleTestSubscribe = async () => {
    setIsLoading(true);
    try {
      const checkoutUrl = await createCheckoutSession();
      if (checkoutUrl) {
        // Redirect to Stripe checkout
        window.location.href = checkoutUrl;
      } else {
        toast.error(t("failedToCreateCheckoutSession"));
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      toast.error(t("failedToCreateCheckoutSessionRetry"));
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (timestamp: number | undefined | null) => {
    // Handle undefined, null, or invalid values
    if (timestamp === undefined || timestamp === null) {
      return "N/A";
    }
    
    // Convert to number if it's a string
    const numTimestamp = typeof timestamp === "string" ? Number(timestamp) : timestamp;
    
    // Validate it's a valid number
    if (isNaN(numTimestamp) || numTimestamp <= 0 || !isFinite(numTimestamp)) {
      console.error("Invalid timestamp:", timestamp, "converted to:", numTimestamp);
      return "N/A";
    }
    
    // Check if timestamp is reasonable (not too far in past or future)
    const minTimestamp = new Date("1970-01-01").getTime();
    const maxTimestamp = new Date("2100-01-01").getTime();
    if (numTimestamp < minTimestamp || numTimestamp > maxTimestamp) {
      console.error("Timestamp out of reasonable range:", numTimestamp);
      return "N/A";
    }
    
    try {
      const date = new Date(numTimestamp);
      const dateTime = date.getTime();
      
      // Double-check the date is valid
      if (isNaN(dateTime) || dateTime <= 0) {
        console.error("Invalid date object from timestamp:", numTimestamp, "date:", date);
        return "N/A";
      }
      
      // Use date-fns format with locale support
      const formatted = format(date, "MMM d, yyyy", {
        locale: isRTL ? undefined : undefined, // date-fns locale can be added here if needed
      });
      
      // Check if format returned NaN (shouldn't happen, but just in case)
      if (formatted.includes("NaN") || formatted === "Invalid Date") {
        console.error("date-fns returned invalid format:", formatted, "from date:", date);
        return "N/A";
      }
      
      return formatted;
    } catch (error) {
      console.error("Error formatting date:", error, timestamp);
      return "N/A";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-500">{t("active")}</Badge>;
      case "trialing":
        return <Badge variant="default" className="bg-blue-500">{t("trialing")}</Badge>;
      case "past_due":
        return <Badge variant="destructive">{t("pastDue")}</Badge>;
      case "canceled":
        return <Badge variant="secondary">{t("canceled")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleReactivateSubscription = async () => {
    setIsReactivating(true);
    try {
      const result = await reactivateSubscription({});
      toast.success(result.message);
    } catch (error) {
      console.error("Error reactivating subscription:", error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : t("failedToReactivateSubscription")
      );
    } finally {
      setIsReactivating(false);
    }
  };

  const handleOpenCustomerPortal = async () => {
    setIsOpeningPortal(true);
    try {
      const portalUrl = await createCustomerPortalSession({});
      if (portalUrl) {
        window.location.href = portalUrl;
      } else {
        toast.error(t("failedToOpenCustomerPortal"));
      }
    } catch (error) {
      console.error("Error opening customer portal:", error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : t("failedToOpenCustomerPortalRetry")
      );
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const handleReSyncSubscription = async () => {
    if (!subscription?.subscriptionId) {
      toast.error(t("noSubscriptionFoundToSync"));
      return;
    }

    setIsReSyncing(true);
    try {
      await syncSubscriptionFromStripe({ subscriptionId: subscription.subscriptionId });
      toast.success(t("subscriptionDataSyncedSuccessfully"));
    } catch (error) {
      console.error("Error syncing subscription:", error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : t("failedToSyncSubscription")
      );
    } finally {
      setIsReSyncing(false);
    }
  };

  const getDaysRemaining = (endDate: number | undefined | null) => {
    if (!endDate) {
      return 0;
    }
    
    // Convert to number if it's a string
    const numEndDate = typeof endDate === "string" ? Number(endDate) : endDate;
    
    if (isNaN(numEndDate) || numEndDate <= 0) {
      return 0;
    }
    
    const now = Date.now();
    const diff = numEndDate - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  };

  const getCycleInfo = () => {
    if (!subscription?.currentPeriodStart || !subscription?.currentPeriodEnd) {
      return null;
    }

    // Ensure dates are numbers
    const startTimestamp = typeof subscription.currentPeriodStart === "string" 
      ? Number(subscription.currentPeriodStart) 
      : subscription.currentPeriodStart;
    const endTimestamp = typeof subscription.currentPeriodEnd === "string" 
      ? Number(subscription.currentPeriodEnd) 
      : subscription.currentPeriodEnd;

    // Validate timestamps
    if (isNaN(startTimestamp) || isNaN(endTimestamp) || startTimestamp <= 0 || endTimestamp <= 0) {
      console.error("Invalid timestamps:", { startTimestamp, endTimestamp });
      return null;
    }

    const start = new Date(startTimestamp);
    const end = new Date(endTimestamp);
    const now = new Date();

    // Validate date objects
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      console.error("Invalid date objects:", { start, end });
      return null;
    }

    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const daysElapsed = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = getDaysRemaining(endTimestamp);
    const progress = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));

    return {
      totalDays,
      daysElapsed,
      daysRemaining,
      progress,
      start,
      end,
    };
  };

  // Load current settings when paymentSettings is available
  useEffect(() => {
    if (paymentSettings) {
      setSelectedProductId(paymentSettings.selectedProductId);
      setSelectedPriceId(paymentSettings.selectedPriceId);
    }
  }, [paymentSettings]);

  const handleFetchProducts = async () => {
    setIsFetchingProducts(true);
    try {
      const products = await fetchStripeProducts({});
      setStripeProducts(products);
      
      // If we have current settings, ensure they're selected
      if (paymentSettings) {
        setSelectedProductId(paymentSettings.selectedProductId);
        setSelectedPriceId(paymentSettings.selectedPriceId);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : t("failedToFetchProducts")
      );
    } finally {
      setIsFetchingProducts(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedProductId || !selectedPriceId) {
      toast.error(t("pleaseSelectProductAndPrice"));
      return;
    }

    const selectedProduct = stripeProducts?.find((p) => p.id === selectedProductId);
    const selectedPrice = selectedProduct?.prices.find((p: any) => p.id === selectedPriceId);

    if (!selectedProduct || !selectedPrice) {
      toast.error(t("selectedProductOrPriceNotFound"));
      return;
    }

    setIsSavingSettings(true);
    try {
      await setPaymentSettings({
        selectedProductId: selectedProduct.id,
        selectedPriceId: selectedPrice.id,
        productName: selectedProduct.name,
        priceAmount: selectedPrice.unitAmount,
        priceCurrency: selectedPrice.currency,
        priceInterval: (selectedPrice.recurring?.interval || "month") as "month" | "year" | "week" | "day",
      });
      toast.success(t("paymentSettingsSavedSuccessfully"));
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : t("failedToSavePaymentSettings")
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const selectedProduct = stripeProducts?.find((p) => p.id === selectedProductId);
  const availablePrices = selectedProduct?.prices.filter((p: any) => p.active && p.type === "recurring") || [];

  return (
    <div className="space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            {t("payments")}
          </h1>
          <p className="text-muted-foreground mt-2">
            {t("manageSubscriptions")}
          </p>
        </div>
      </div>

      {/* Subscription Status Card */}
      {subscription !== undefined && (
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
            <CardDescription>
              {t("yourSubscriptionInfo")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSyncing ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p>{t("syncingSubscriptionStatus")}</p>
              </div>
            ) : subscription === null ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="h-5 w-5" />
                  <p>{t("noActiveSubscription")}</p>
                </div>
                {paymentSettings && (
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <p className="text-sm font-medium mb-1">{t("subscribe")}</p>
                    <p className="text-sm text-muted-foreground">
                      {paymentSettings 
                        ? t("subscribeToProduct")
                            .replace("{productName}", paymentSettings.productName)
                            .replace("{price}", formatPrice(paymentSettings.priceAmount, paymentSettings.priceCurrency))
                            .replace("{interval}", translateInterval(paymentSettings.priceInterval))
                        : t("testStripePaymentFlow")}
                    </p>
                  </div>
                )}
                {!paymentSettings && (
                  <p className="text-sm text-muted-foreground">
                    {t("noProductConfigured")}
                  </p>
                )}
                <Button
                  variant="cta"
                  onClick={handleTestSubscribe}
                  disabled={isLoading || !paymentSettings}
                  className="w-full sm:w-auto"
                >
                  {isLoading ? t("creatingCheckoutSession") : paymentSettings ? t("subscribe") : t("subscribeNow")}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Subscription Status Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="font-medium">{t("subscriptionActive")}</span>
                  </div>
                  {getStatusBadge(subscription.status)}
                </div>

                <Separator />

                {/* Billing Cycle Information */}
                {(() => {
                  // Validate dates before rendering
                  const startValid = subscription.currentPeriodStart && 
                    !isNaN(Number(subscription.currentPeriodStart)) && 
                    Number(subscription.currentPeriodStart) > 0;
                  const endValid = subscription.currentPeriodEnd && 
                    !isNaN(Number(subscription.currentPeriodEnd)) && 
                    Number(subscription.currentPeriodEnd) > 0;
                  
                  if (!startValid || !endValid) {
                    // Show a message and re-sync button if dates are invalid
                    return (
                      <div className="space-y-4">
                        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                          <p className="text-sm font-medium text-yellow-500 mb-2">{t("subscriptionDataNeedsSync")}</p>
                          <p className="text-sm text-muted-foreground mb-3">
                            {t("subscriptionDatesInvalid")}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleReSyncSubscription}
                            disabled={isReSyncing}
                          >
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
                  
                  const cycleInfo = getCycleInfo();
                  if (!cycleInfo) {
                    return null;
                  }
                  
                  return (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold mb-3">{t("billingCycle")}</h3>
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
                        
                        {/* Progress Bar */}
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
                })()}

                {/* Cancellation Info */}
                {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && (
                  <>
                    <Separator />
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                      <XCircle className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-orange-500">{t("scheduledForCancellation")}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t("subscriptionEndsOn")}{" "}
                          <span className="font-medium">{formatDate(subscription.currentPeriodEnd)}</span>.
                          {" "}{t("canReactivateAnytime")}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  {subscription.cancelAtPeriodEnd && (
                    <Button
                      variant="outline"
                      onClick={handleReactivateSubscription}
                      disabled={isReactivating}
                      className="flex-1"
                    >
                      <RefreshCw className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2", isReactivating && "animate-spin")} />
                      {isReactivating ? t("reactivating") : t("reactivateSubscription")}
                    </Button>
                  )}
                  
                  <Button
                    variant="outline"
                    onClick={handleOpenCustomerPortal}
                    disabled={isOpeningPortal}
                    className="flex-1"
                  >
                    <ExternalLink className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                    {isOpeningPortal ? t("opening") : t("manageInStripe")}
                  </Button>
                </div>

                {/* Additional Info */}
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  <p>
                    {t("manageInStripeDescription")}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Admin Product Management Section */}
      {isAdmin && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t("productPriceManagement")}
              <Badge variant="outline" className="text-xs">
                {t("adminOnly")}
              </Badge>
            </CardTitle>
            <CardDescription>
              {t("configureStripeProduct")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Settings Display */}
            {paymentSettings && (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-sm font-medium mb-1">{t("currentConfiguration")}</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    <span className="font-medium">{t("product")}:</span> {paymentSettings.productName}
                  </p>
                  <p>
                    <span className="font-medium">{t("price")}:</span> {formatPrice(paymentSettings.priceAmount, paymentSettings.priceCurrency)} / {translateInterval(paymentSettings.priceInterval)}
                  </p>
                </div>
              </div>
            )}

            {/* Fetch Products Button */}
            <div>
              <Button
                variant="outline"
                onClick={handleFetchProducts}
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

            {/* Product Selection */}
            {stripeProducts && stripeProducts.length > 0 && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="product-select">{t("selectProduct")}</Label>
                  <Select
                    value={selectedProductId}
                    onValueChange={(value) => {
                      setSelectedProductId(value);
                      setSelectedPriceId(""); // Reset price when product changes
                    }}
                  >
                    <SelectTrigger id="product-select">
                      <SelectValue placeholder={t("chooseProduct")} />
                    </SelectTrigger>
                    <SelectContent>
                      {stripeProducts.map((product) => {
                        const activePrices = product.prices?.filter((p: any) => p.active && p.type === "recurring") || [];
                        const priceDisplay = activePrices.length > 0
                          ? activePrices.map((price: any) => {
                              const formatted = formatPrice(price.unitAmount, price.currency);
                              const interval = price.recurring?.interval || "one-time";
                              const intervalCount = price.recurring?.intervalCount;
                              const intervalText = intervalCount && intervalCount > 1
                                ? `every ${intervalCount} ${interval}s`
                                : interval;
                              return `${formatted} / ${translateInterval(intervalText)}`;
                            }).join(", ")
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

                {/* Price Selection */}
                {selectedProductId && availablePrices.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="price-select">{t("selectPrice")}</Label>
                    <Select
                      value={selectedPriceId}
                      onValueChange={setSelectedPriceId}
                    >
                      <SelectTrigger id="price-select">
                        <SelectValue placeholder={t("choosePrice")} />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePrices.map((price: any) => (
                          <SelectItem key={price.id} value={price.id}>
                            {formatPrice(price.unitAmount, price.currency)} / {price.recurring?.interval || "one-time"}
                            {price.recurring?.intervalCount && price.recurring.intervalCount > 1 && ` (every ${price.recurring.intervalCount} ${price.recurring.interval}s)`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedProductId && availablePrices.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("noActiveRecurringPrices")}
                  </p>
                )}

                {/* Save Button */}
                {selectedProductId && selectedPriceId && (
                  <Button
                    variant="cta"
                    onClick={handleSaveSettings}
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
              <p className="text-sm text-muted-foreground">
                {t("noActiveProducts")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscribe Card - Only show for canceled subscriptions, not for null (no subscription) */}
      {subscription && subscription.status === "canceled" && (
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
                    .replace("{price}", formatPrice(paymentSettings.priceAmount, paymentSettings.priceCurrency))
                    .replace("{interval}", translateInterval(paymentSettings.priceInterval))
                : t("testStripePaymentFlow")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {!paymentSettings && (
                <p className="text-sm text-muted-foreground">
                  {t("noProductConfigured")}
                </p>
              )}
              <Button
                variant="cta"
                onClick={handleTestSubscribe}
                disabled={isLoading || !paymentSettings}
                className="w-full sm:w-auto"
              >
                {isLoading ? t("creatingCheckoutSession") : paymentSettings ? t("subscribe") : t("testSubscription")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Payments;

