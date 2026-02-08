import { usePayments } from "./Payments/usePayments";
import { SubscriptionStatusCard } from "./Payments/SubscriptionStatusCard";
import { AdminProductManagement } from "./Payments/AdminProductManagement";
import { SubscribeCard } from "./Payments/SubscribeCard";

const Payments = () => {
  const {
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
    handleTestSubscribe,
    handleReactivateSubscription,
    handleOpenCustomerPortal,
    handleReSyncSubscription,
    handleFetchProducts,
    handleSaveSettings,
  } = usePayments();

  return (
    <div className="space-y-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            {t("payments")}
          </h1>
          <p className="text-muted-foreground mt-2">{t("manageSubscriptions")}</p>
        </div>
      </div>

      <SubscriptionStatusCard
        subscription={subscription}
        paymentSettings={paymentSettings}
        isSyncing={isSyncing}
        effectiveStatus={getEffectiveStatus()}
        cycleInfo={cycleInfo}
        validPeriodDates={validPeriodDates}
        isLoading={isLoading}
        isReactivating={isReactivating}
        isOpeningPortal={isOpeningPortal}
        isReSyncing={isReSyncing}
        isRTL={isRTL}
        t={t}
        translateInterval={translateInterval}
        onSubscribe={handleTestSubscribe}
        onReactivate={handleReactivateSubscription}
        onOpenPortal={handleOpenCustomerPortal}
        onReSync={handleReSyncSubscription}
      />

      {isAdmin && (
        <AdminProductManagement
          paymentSettings={paymentSettings}
          stripeProducts={stripeProducts}
          selectedProductId={selectedProductId}
          setSelectedProductId={setSelectedProductId}
          selectedMonthlyPriceId={selectedMonthlyPriceId}
          setSelectedMonthlyPriceId={setSelectedMonthlyPriceId}
          selectedYearlyPriceId={selectedYearlyPriceId}
          setSelectedYearlyPriceId={setSelectedYearlyPriceId}
          monthlyPrices={monthlyPrices}
          yearlyPrices={yearlyPrices}
          isFetchingProducts={isFetchingProducts}
          isSavingSettings={isSavingSettings}
          isRTL={isRTL}
          t={t}
          translateInterval={translateInterval}
          onFetchProducts={handleFetchProducts}
          onSaveSettings={handleSaveSettings}
        />
      )}

      {subscription && subscription.status === "canceled" && (
        <SubscribeCard
          paymentSettings={paymentSettings}
          isLoading={isLoading}
          isRTL={isRTL}
          t={t}
          translateInterval={translateInterval}
          onSubscribe={handleTestSubscribe}
        />
      )}
    </div>
  );
};

export default Payments;
