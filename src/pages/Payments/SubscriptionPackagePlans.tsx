import { useState } from "react";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PackagePlansGrid } from "@/components/SubscriptionPlans/PackagePlansGrid";
import { PlanCompareModal } from "@/components/CoursePreview/PlanCompareModal";
import { Button } from "@/components/ui/button";
import { Layers } from "lucide-react";

type SubscriptionPackagePlansProps = {
  plans: Array<{
    _id: Id<"subscriptionPlans">;
    name: string;
    name_ar: string;
    titleIcon?: string;
    billingInterval: "month" | "year";
    priceAmount: number;
    priceCurrency: string;
    compareAtPriceAmount?: number;
    priceSubtitle?: string;
    priceSubtitle_ar?: string;
    theme: {
      primary: string;
      secondary: string;
      border: string;
      headerBg: string;
      buttonBg: string;
    };
    badgeTag: "start_here" | "best_value" | "most_popular" | "limited" | "vip" | "none";
    ribbonText?: string;
    ribbonText_ar?: string;
    inheritsDescription?: string;
    inheritsDescription_ar?: string;
    features: Array<{
      icon: string;
      title: string;
      title_ar?: string;
      subtitle?: string;
      subtitle_ar?: string;
      isChecklistItem: boolean;
      displayOrder: number;
    }>;
    displayOrder: number;
    isAtCapacity: boolean;
    isCurrentPlan: boolean;
    courseStats?: {
      courses: number;
      lessons: number;
      hours: number;
    };
  }>;
  hasActiveSubscription: boolean;
  isRTL: boolean;
  language: string;
  t: (key: string) => string;
};

export function SubscriptionPackagePlans({
  plans,
  hasActiveSubscription,
  isRTL,
  language,
  t,
}: SubscriptionPackagePlansProps) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [processingPlanId, setProcessingPlanId] = useState<Id<"subscriptionPlans"> | null>(null);
  const createPlanCheckoutSession = useAction(api.plansStripe.createPlanCheckoutSession);
  const upgradePlanSubscription = useAction(api.plansStripe.upgradePlanSubscription);
  const useArabic = language === "ar";
  const isUpgradeMode = hasActiveSubscription;

  if (plans.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("packagePaywallNoPlans")}</p>
    );
  }

  const handleSelectPlan = async (planId: Id<"subscriptionPlans">) => {
    setProcessingPlanId(planId);
    try {
      if (isUpgradeMode) {
        const result = await upgradePlanSubscription({ planId });
        toast.success(result.message);
        return;
      }

      const checkoutUrl = await createPlanCheckoutSession({ planId });
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      toast.error(t("packagePaywallCheckoutError"));
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : t("packagePaywallCheckoutError");
      toast.error(message);
    } finally {
      setProcessingPlanId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PackagePlansGrid
        plans={plans}
        isRTL={isRTL}
        useArabic={useArabic}
        isUpgradeMode={isUpgradeMode}
        isProcessing={processingPlanId !== null}
        processingPlanId={processingPlanId}
        onSelectPlan={handleSelectPlan}
        subscribeLabel={t("subscribeUnlock")}
        upgradeLabel={t("packagePaywallUpgrade")}
        currentPlanLabel={t("packagePaywallCurrentPlan")}
        unavailableLabel={t("packagePaywallUnavailable")}
      />

      {plans.length > 1 && (
        <div className="flex justify-center">
          <Button variant="outline" className="gap-2" onClick={() => setCompareOpen(true)}>
            <Layers className="h-4 w-4" />
            {t("packagePaywallComparePlans")}
          </Button>
        </div>
      )}

      <PlanCompareModal
        open={compareOpen}
        onOpenChange={setCompareOpen}
        plans={plans}
        isRTL={isRTL}
        useArabic={useArabic}
        title={t("packagePaywallComparePlans")}
        description={t("packagePaywallCompareDescription")}
        subscribeLabel={t("subscribeUnlock")}
        upgradeLabel={t("packagePaywallUpgrade")}
        currentPlanLabel={t("packagePaywallCurrentPlan")}
        unavailableLabel={t("packagePaywallUnavailable")}
        loadingPlanId={processingPlanId}
        paywallMode={isUpgradeMode ? "packages_upgrade" : "packages_subscribe"}
        onSelectPlan={(planId) => handleSelectPlan(planId as Id<"subscriptionPlans">)}
      />
    </div>
  );
}
