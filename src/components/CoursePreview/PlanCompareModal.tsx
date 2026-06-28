import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  PlanPreviewCard,
  type PlanPreviewData,
  planCompareGridClassForCount,
} from "@/components/SubscriptionPlans/PlanPreviewCard";
import type { PackagePlan } from "@/components/SubscriptionPlans/PackagePlansGrid";

type PaywallPlan = PlanPreviewData &
  PackagePlan & {
    _id: string;
  };

type PlanCompareModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plans: PaywallPlan[];
  courseName?: string;
  isRTL: boolean;
  useArabic: boolean;
  title: string;
  description: string;
  subscribeLabel: string;
  upgradeLabel: string;
  currentPlanLabel: string;
  unavailableLabel: string;
  loadingPlanId: string | null;
  paywallMode: "packages_subscribe" | "packages_upgrade";
  onSelectPlan: (planId: string) => void;
};

export function PlanCompareModal({
  open,
  onOpenChange,
  plans,
  courseName,
  isRTL,
  useArabic,
  title,
  description,
  subscribeLabel,
  upgradeLabel,
  currentPlanLabel,
  unavailableLabel,
  loadingPlanId,
  paywallMode,
  onSelectPlan,
}: PlanCompareModalProps) {
  const modalDescription = courseName
    ? description.replace("{course}", courseName)
    : description.replace("{course}", useArabic ? "هذا البرنامج" : "this course");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "!flex max-h-[92vh] min-h-0 flex-col gap-0 overflow-hidden p-0",
          plans.length === 1
            ? "w-[min(100vw-2rem,28rem)] max-w-[min(100vw-2rem,28rem)]"
            : "w-[min(100vw-2rem,72rem)] max-w-[min(100vw-2rem,72rem)]",
        )}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5 text-start">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {modalDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
          <div className={planCompareGridClassForCount(plans.length)}>
            {plans.map((plan) => {
              const isUpgradeMode = paywallMode === "packages_upgrade";
              const actionLabel = plan.isCurrentPlan
                ? currentPlanLabel
                : plan.isAtCapacity
                  ? unavailableLabel
                  : isUpgradeMode
                    ? upgradeLabel
                    : subscribeLabel;

              return (
                <PlanPreviewCard
                  key={plan._id}
                  plan={plan}
                  isRTL={isRTL}
                  useArabic={useArabic}
                  layout="grid"
                  actionLabel={actionLabel}
                  actionDisabled={plan.isCurrentPlan || plan.isAtCapacity}
                  actionLoading={loadingPlanId === plan._id}
                  onAction={
                    plan.isCurrentPlan || plan.isAtCapacity
                      ? undefined
                      : () => {
                          onSelectPlan(plan._id);
                          onOpenChange(false);
                        }
                  }
                />
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
