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
  planCardGridClass,
  planCardWidthClass,
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
          "flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0",
          plans.length === 1 ? "max-w-md" : "max-w-6xl",
        )}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <DialogHeader className="space-y-2 border-b px-6 py-5 text-start">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {modalDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className={planCardGridClass}>
            {plans.map((plan) => {
              const isUpgradeMode = paywallMode === "packages_upgrade";
              const inheritsText = useArabic
                ? plan.inheritsDescription_ar?.trim() || plan.inheritsDescription?.trim()
                : plan.inheritsDescription?.trim();
              const actionLabel = plan.isCurrentPlan
                ? currentPlanLabel
                : plan.isAtCapacity
                  ? unavailableLabel
                  : isUpgradeMode
                    ? upgradeLabel
                    : subscribeLabel;

              return (
                <div key={plan._id} className={cn("space-y-2", planCardWidthClass)}>
                  {inheritsText ? (
                    <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      {inheritsText}
                    </p>
                  ) : null}
                  <PlanPreviewCard
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
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
