import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, CheckCircle2, XCircle, Calendar, Ban, ExternalLink, RefreshCw, Settings, Loader2 } from "lucide-react";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const createCheckoutSession = useAction(api.payment.createCheckoutSession);
  const syncSubscriptionStatus = useAction(api.payment.syncSubscriptionStatus);
  const cancelSubscription = useAction(api.payment.cancelSubscription);
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
  const [isCanceling, setIsCanceling] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isReSyncing, setIsReSyncing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  
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
            toast.success("Payment successful! Your subscription has been activated.");
          } else {
            toast.success("Payment successful! Your subscription is being activated...");
          }
        })
        .catch((error) => {
          console.error("Error syncing subscription:", error);
          toast.error("Payment successful, but failed to sync subscription status. Please refresh the page.");
        })
        .finally(() => {
          setIsSyncing(false);
          // Remove query params
          setSearchParams({});
        });
    } else if (canceled === "true") {
      toast.info("Payment was canceled. You can try again anytime.");
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
        toast.error("Failed to create checkout session");
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      toast.error("Failed to create checkout session. Please try again.");
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
      
      // Use date-fns format, but catch any errors
      const formatted = format(date, "MMM d, yyyy");
      
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
        return <Badge variant="default" className="bg-green-500">Active</Badge>;
      case "trialing":
        return <Badge variant="default" className="bg-blue-500">Trialing</Badge>;
      case "past_due":
        return <Badge variant="destructive">Past Due</Badge>;
      case "canceled":
        return <Badge variant="secondary">Canceled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleCancelSubscription = async () => {
    setIsCanceling(true);
    try {
      const result = await cancelSubscription({});
      toast.success(result.message);
      setShowCancelDialog(false);
    } catch (error) {
      console.error("Error canceling subscription:", error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : "Failed to cancel subscription. Please try again."
      );
    } finally {
      setIsCanceling(false);
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
          : "Failed to reactivate subscription. Please try again."
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
        toast.error("Failed to open customer portal");
      }
    } catch (error) {
      console.error("Error opening customer portal:", error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : "Failed to open customer portal. Please try again."
      );
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const handleReSyncSubscription = async () => {
    if (!subscription?.subscriptionId) {
      toast.error("No subscription found to sync");
      return;
    }

    setIsReSyncing(true);
    try {
      await syncSubscriptionFromStripe({ subscriptionId: subscription.subscriptionId });
      toast.success("Subscription data synced successfully");
    } catch (error) {
      console.error("Error syncing subscription:", error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : "Failed to sync subscription. Please try again."
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
          : "Failed to fetch products from Stripe"
      );
    } finally {
      setIsFetchingProducts(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedProductId || !selectedPriceId) {
      toast.error("Please select both a product and a price");
      return;
    }

    const selectedProduct = stripeProducts?.find((p) => p.id === selectedProductId);
    const selectedPrice = selectedProduct?.prices.find((p: any) => p.id === selectedPriceId);

    if (!selectedProduct || !selectedPrice) {
      toast.error("Selected product or price not found");
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
      toast.success("Payment settings saved successfully");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(
        error instanceof Error 
          ? error.message 
          : "Failed to save payment settings"
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            Payments
            <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5">
              Alpha
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage subscriptions and payment processing
          </p>
        </div>
      </div>

      {/* Subscription Status Card */}
      {subscription !== undefined && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Status
              {isSyncing && (
                <Badge variant="outline" className="text-xs">
                  Syncing...
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Your current subscription information
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSyncing ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p>Syncing subscription status from Stripe...</p>
              </div>
            ) : subscription === null ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="h-5 w-5" />
                  <p>You don&apos;t have an active subscription.</p>
                </div>
                <Button
                  variant="cta"
                  onClick={handleTestSubscribe}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  {isLoading ? "Creating checkout session..." : "Subscribe Now"}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Subscription Status Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="font-medium">Subscription Active</span>
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
                          <p className="text-sm font-medium text-yellow-500 mb-2">Subscription Data Needs Sync</p>
                          <p className="text-sm text-muted-foreground mb-3">
                            The subscription dates are missing or invalid. Click the button below to sync the latest data from Stripe.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleReSyncSubscription}
                            disabled={isReSyncing}
                          >
                            {isReSyncing ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Syncing...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Sync from Stripe
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
                        <h3 className="text-sm font-semibold mb-3">Billing Cycle</h3>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Current Period</p>
                            <p className="text-sm font-medium">
                              {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Days Remaining</p>
                            <p className="text-sm font-medium">
                              {cycleInfo.daysRemaining} {cycleInfo.daysRemaining === 1 ? "day" : "days"}
                            </p>
                          </div>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="space-y-2 pt-2">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Cycle Progress</span>
                            <span>{Math.round(cycleInfo.progress)}%</span>
                          </div>
                          <div className="relative h-2 bg-secondary/50 rounded-full overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary-glow rounded-full transition-all duration-300"
                              style={{ width: `${cycleInfo.progress}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{cycleInfo.daysElapsed} days elapsed</span>
                            <span>{cycleInfo.daysRemaining} days remaining</span>
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
                        <p className="text-sm font-medium text-orange-500">Scheduled for Cancellation</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Your subscription will end on{" "}
                          <span className="font-medium">{formatDate(subscription.currentPeriodEnd)}</span>.
                          You can reactivate it anytime before then.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  {subscription.cancelAtPeriodEnd ? (
                    <Button
                      variant="outline"
                      onClick={handleReactivateSubscription}
                      disabled={isReactivating}
                      className="flex-1"
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${isReactivating ? "animate-spin" : ""}`} />
                      {isReactivating ? "Reactivating..." : "Reactivate Subscription"}
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={() => setShowCancelDialog(true)}
                      disabled={isCanceling}
                      className="flex-1"
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Cancel Subscription
                    </Button>
                  )}
                  
                  <Button
                    variant="outline"
                    onClick={handleOpenCustomerPortal}
                    disabled={isOpeningPortal}
                    className="flex-1"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {isOpeningPortal ? "Opening..." : "Manage in Stripe"}
                  </Button>
                </div>

                {/* Additional Info */}
                <div className="text-xs text-muted-foreground pt-2 border-t">
                  <p>
                    Use the "Manage in Stripe" button to update payment methods, view billing history, 
                    and manage your subscription settings.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cancel Subscription Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Your subscription will remain active until the end of the current billing period.
              {subscription?.currentPeriodEnd && (
                <>
                  {" "}
                  You will continue to have access until{" "}
                  <span className="font-medium">{formatDate(subscription.currentPeriodEnd)}</span>.
                </>
              )}
              <br />
              <br />
              You can reactivate your subscription at any time before the period ends.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCanceling}>Keep Subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={isCanceling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCanceling ? "Canceling..." : "Cancel Subscription"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin Product Management Section */}
      {isAdmin && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Product & Price Management
              <Badge variant="outline" className="text-xs">
                Admin Only
              </Badge>
            </CardTitle>
            <CardDescription>
              Configure which Stripe product and price to use for subscriptions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Current Settings Display */}
            {paymentSettings && (
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-sm font-medium mb-1">Current Configuration</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    <span className="font-medium">Product:</span> {paymentSettings.productName}
                  </p>
                  <p>
                    <span className="font-medium">Price:</span> {formatPrice(paymentSettings.priceAmount, paymentSettings.priceCurrency)} / {paymentSettings.priceInterval}
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching from Stripe...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Fetch Products from Stripe
                  </>
                )}
              </Button>
            </div>

            {/* Product Selection */}
            {stripeProducts && stripeProducts.length > 0 && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="product-select">Select Product</Label>
                  <Select
                    value={selectedProductId}
                    onValueChange={(value) => {
                      setSelectedProductId(value);
                      setSelectedPriceId(""); // Reset price when product changes
                    }}
                  >
                    <SelectTrigger id="product-select">
                      <SelectValue placeholder="Choose a product" />
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
                              return `${formatted} / ${intervalText}`;
                            }).join(", ")
                          : "No active prices";
                        
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
                    <Label htmlFor="price-select">Select Price</Label>
                    <Select
                      value={selectedPriceId}
                      onValueChange={setSelectedPriceId}
                    >
                      <SelectTrigger id="price-select">
                        <SelectValue placeholder="Choose a price" />
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
                    No active recurring prices found for this product.
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
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Configuration"
                    )}
                  </Button>
                )}
              </div>
            )}

            {stripeProducts && stripeProducts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No active products found in Stripe. Create products in your Stripe dashboard first.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscribe Card */}
      {(!subscription || subscription.status === "canceled") && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {paymentSettings ? "Subscribe" : "Test Subscription"}
            </CardTitle>
            <CardDescription>
              {paymentSettings 
                ? `Subscribe to ${paymentSettings.productName} for ${formatPrice(paymentSettings.priceAmount, paymentSettings.priceCurrency)} per ${paymentSettings.priceInterval}`
                : "Test the Stripe payment flow with a test subscription. This will redirect you to Stripe's checkout page."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {!paymentSettings && (
                <p className="text-sm text-muted-foreground">
                  No product configured. An admin needs to configure a product first.
                </p>
              )}
              <Button
                variant="cta"
                onClick={handleTestSubscribe}
                disabled={isLoading || !paymentSettings}
                className="w-full sm:w-auto"
              >
                {isLoading ? "Creating checkout session..." : paymentSettings ? "Subscribe" : "Test Subscribe"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Payments;

