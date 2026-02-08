import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAction, useQuery, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import type { CycleInfo } from "./utils";
import { getCycleInfo, getDaysRemaining, hasValidPeriodDates } from "./utils";

export type Subscription = {
  subscriptionId: string;
  status: "active" | "canceled" | "past_due" | "unpaid" | "incomplete" | "trialing";
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  canceledAt?: number;
  /** Billing interval from Stripe (e.g. "month", "year") so yearly plans don't show as "month" */
  interval?: string;
  intervalCount?: number;
};

export type PaymentSettings = {
  productName: string;
  selectedProductId: string;
  selectedMonthlyPriceId: string;
  monthlyPriceAmount: number;
  monthlyPriceCurrency: string;
  selectedYearlyPriceId?: string | null;
  yearlyPriceAmount?: number | null;
  yearlyPriceCurrency?: string | null;
  priceAmount: number;
  priceCurrency: string;
  priceInterval: string;
};

export type StripePrice = {
  id: string;
  unitAmount: number;
  currency: string;
  active: boolean;
  type: string;
  recurring?: { interval: string; intervalCount?: number };
};

export type StripeProduct = {
  id: string;
  name: string;
  description?: string;
  prices: StripePrice[];
};

export function usePayments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, isRTL, translateInterval } = useLanguage();

  const createCheckoutSession = useAction(api.payment.createCheckoutSession);
  const syncSubscriptionStatus = useAction(api.payment.syncSubscriptionStatus);
  const reactivateSubscription = useAction(api.payment.reactivateSubscription);
  const createCustomerPortalSession = useAction(api.payment.createCustomerPortalSession);
  const fetchStripeProducts = useAction(api.payment.fetchStripeProducts);
  const setPaymentSettings = useMutation(api.paymentInternal.setPaymentSettings);
  const syncSubscriptionFromStripe = useAction(api.payment.syncSubscriptionFromStripe);

  const subscription = useQuery(api.paymentInternal.getMySubscription) as Subscription | null | undefined;
  const currentUser = useQuery(api.user.getCurrentUser);
  const paymentSettings = useQuery(api.paymentInternal.getPaymentSettingsPublic) as PaymentSettings | null | undefined;

  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [isReSyncing, setIsReSyncing] = useState(false);

  const [stripeProducts, setStripeProducts] = useState<StripeProduct[] | null>(null);
  const [isFetchingProducts, setIsFetchingProducts] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedMonthlyPriceId, setSelectedMonthlyPriceId] = useState("");
  const [selectedYearlyPriceId, setSelectedYearlyPriceId] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const isAdmin = currentUser?.isGod ?? false;

  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    const sessionId = searchParams.get("session_id");

    if (success === "true" && sessionId) {
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
          setSearchParams({});
        });
    } else if (canceled === "true") {
      toast.info(t("paymentCanceled"));
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, syncSubscriptionStatus, t]);

  useEffect(() => {
    if (paymentSettings) {
      setSelectedProductId(paymentSettings.selectedProductId);
      setSelectedMonthlyPriceId(paymentSettings.selectedMonthlyPriceId ?? "");
      setSelectedYearlyPriceId(paymentSettings.selectedYearlyPriceId ?? "");
    }
  }, [paymentSettings]);

  const handleTestSubscribe = async (priceId?: string) => {
    setIsLoading(true);
    try {
      const checkoutUrl = await createCheckoutSession({ priceId });
      if (checkoutUrl) {
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

  const handleReactivateSubscription = async () => {
    setIsReactivating(true);
    try {
      const result = await reactivateSubscription({});
      toast.success(result.message);
    } catch (error) {
      console.error("Error reactivating subscription:", error);
      toast.error(
        error instanceof Error ? error.message : t("failedToReactivateSubscription")
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
      const message =
        error instanceof ConvexError && typeof error.data === "object" && error.data !== null && "message" in error.data
          ? String((error.data as { message?: string }).message ?? "")
          : error instanceof Error
            ? error.message
            : "";
      const isAdminGranted =
        (error instanceof ConvexError && typeof error.data === "object" && error.data !== null && (error.data as { code?: string }).code === "ADMIN_GRANTED_SUBSCRIPTION") ||
        message.includes("granted by an admin") ||
        message.includes("contact support");
      toast.error(
        isAdminGranted ? t("subscriptionAdminGrantedContactSupport") : t("failedToOpenCustomerPortalRetry")
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
        error instanceof Error ? error.message : t("failedToSyncSubscription")
      );
    } finally {
      setIsReSyncing(false);
    }
  };

  const handleFetchProducts = async () => {
    setIsFetchingProducts(true);
    try {
      const products = await fetchStripeProducts({});
      setStripeProducts(products as StripeProduct[]);
      if (paymentSettings) {
        setSelectedProductId(paymentSettings.selectedProductId);
        setSelectedMonthlyPriceId(paymentSettings.selectedMonthlyPriceId ?? "");
        setSelectedYearlyPriceId(paymentSettings.selectedYearlyPriceId ?? "");
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error(
        error instanceof Error ? error.message : t("failedToFetchProducts")
      );
    } finally {
      setIsFetchingProducts(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedProductId || !selectedMonthlyPriceId) {
      toast.error(t("pleaseSelectProductAndMonthlyPrice"));
      return;
    }
    const selectedProduct = stripeProducts?.find((p) => p.id === selectedProductId);
    const selectedMonthlyPrice = selectedProduct?.prices.find((p) => p.id === selectedMonthlyPriceId);
    const selectedYearlyPrice = selectedYearlyPriceId
      ? selectedProduct?.prices.find((p) => p.id === selectedYearlyPriceId)
      : undefined;

    if (!selectedProduct || !selectedMonthlyPrice) {
      toast.error(t("selectedProductOrPriceNotFound"));
      return;
    }

    setIsSavingSettings(true);
    try {
      await setPaymentSettings({
        selectedProductId: selectedProduct.id,
        productName: selectedProduct.name,
        selectedMonthlyPriceId: selectedMonthlyPrice.id,
        monthlyPriceAmount: selectedMonthlyPrice.unitAmount,
        monthlyPriceCurrency: selectedMonthlyPrice.currency,
        ...(selectedYearlyPrice && {
          selectedYearlyPriceId: selectedYearlyPrice.id,
          yearlyPriceAmount: selectedYearlyPrice.unitAmount,
          yearlyPriceCurrency: selectedYearlyPrice.currency,
        }),
      });
      toast.success(t("paymentSettingsSavedSuccessfully"));
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error(
        error instanceof Error ? error.message : t("failedToSavePaymentSettings")
      );
    } finally {
      setIsSavingSettings(false);
    }
  };

  const getEffectiveStatus = (): string => {
    if (!subscription) return "canceled";
    const { status, currentPeriodEnd } = subscription;
    if (
      (status === "active" || status === "trialing") &&
      currentPeriodEnd != null &&
      currentPeriodEnd < Date.now()
    ) {
      return "expired";
    }
    return status;
  };

  const cycleInfo: CycleInfo | null = subscription
    ? getCycleInfo(subscription)
    : null;
  const validPeriodDates = subscription ? hasValidPeriodDates(subscription) : false;

  const selectedProduct = stripeProducts?.find((p) => p.id === selectedProductId);
  const recurringPrices = selectedProduct?.prices.filter((p) => p.active && p.type === "recurring") ?? [];
  const monthlyPrices = recurringPrices.filter(
    (p) => (p.recurring?.interval ?? "").toLowerCase() === "month"
  );
  const yearlyPrices = recurringPrices.filter(
    (p) => (p.recurring?.interval ?? "").toLowerCase() === "year"
  );

  return {
    t,
    isRTL,
    translateInterval,
    subscription,
    paymentSettings,
    isAdmin,
    isLoading,
    isSyncing,
    isReactivating,
    isOpeningPortal,
    isReSyncing,
    stripeProducts,
    isFetchingProducts,
    selectedProductId,
    setSelectedProductId,
    selectedMonthlyPriceId,
    setSelectedMonthlyPriceId,
    selectedYearlyPriceId,
    setSelectedYearlyPriceId,
    isSavingSettings,
    getEffectiveStatus,
    cycleInfo,
    validPeriodDates,
    monthlyPrices,
    yearlyPrices,
    selectedProduct,
    handleTestSubscribe,
    handleReactivateSubscription,
    handleOpenCustomerPortal,
    handleReSyncSubscription,
    handleFetchProducts,
    handleSaveSettings,
  };
}
