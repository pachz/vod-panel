import { usePayments } from "./Payments/usePayments";
import { useNavigate } from "react-router-dom";
import { SubscriptionStatusCard } from "./Payments/SubscriptionStatusCard";
import { AdminProductManagement } from "./Payments/AdminProductManagement";
import { AdminMultipleActiveSubscriptions } from "./Payments/AdminMultipleActiveSubscriptions";
import { SubscribeCard } from "./Payments/SubscribeCard";
import { SubscriptionPackagePlans } from "./Payments/SubscriptionPackagePlans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers } from "lucide-react";

const Payments = () => {
  const navigate = useNavigate();
  const {
    t,
    isRTL,
    language,
    translateInterval,
    subscription,
    paymentSettings,
    usesPackageModel,
    packagePlans,
    hasActivePackageSubscription,
    isAdmin,
    usersWithMultipleActiveSubscriptions,
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
        usesPackageModel={usesPackageModel}
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

      {usesPackageModel && packagePlans.length > 0 && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              {t("paymentsPackagePlansTitle")}
            </CardTitle>
            <CardDescription>{t("paymentsPackagePlansDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SubscriptionPackagePlans
              plans={packagePlans}
              hasActiveSubscription={hasActivePackageSubscription}
              isRTL={isRTL}
              language={language}
              t={t}
            />
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <>
          <AdminMultipleActiveSubscriptions
            usersWithMultipleActiveSubscriptions={usersWithMultipleActiveSubscriptions}
            onOpenUser={(userId) => navigate(`/users/${userId}/info`)}
          />
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
        </>
      )}

      {subscription && subscription.status === "canceled" && !usesPackageModel && (
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
