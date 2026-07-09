import { cn } from "@/lib/utils";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  PlanPreviewCard,
  type PlanPreviewData,
  planPackageGridClassForCount,
} from "./PlanPreviewCard";

export type PackagePlan = PlanPreviewData & {
  _id: Id<"subscriptionPlans">;
  isAtCapacity: boolean;
  isCurrentPlan: boolean;
  courseStats?: {
    courses: number;
    lessons: number;
    hours: number;
  };
};

type PackagePlansGridProps = {
  plans: PackagePlan[];
  isRTL: boolean;
  useArabic: boolean;
  isUpgradeMode?: boolean;
  isProcessing?: boolean;
  processingPlanId?: Id<"subscriptionPlans"> | null;
  onSelectPlan?: (planId: Id<"subscriptionPlans">) => void;
  subscribeLabel: string;
  upgradeLabel: string;
  currentPlanLabel: string;
  unavailableLabel: string;
  className?: string;
};

export function PackagePlansGrid({
  plans,
  isRTL,
  useArabic,
  isUpgradeMode = false,
  isProcessing = false,
  processingPlanId = null,
  onSelectPlan,
  subscribeLabel,
  upgradeLabel,
  currentPlanLabel,
  unavailableLabel,
  className,
}: PackagePlansGridProps) {
  if (plans.length === 0) {
    return null;
  }

  return (
    <div className={cn(planPackageGridClassForCount(plans.length), className)}>
      {plans.map((plan) => {
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
            actionDisabled={
              plan.isCurrentPlan || plan.isAtCapacity || isProcessing
            }
            actionLoading={processingPlanId === plan._id}
            onAction={
              onSelectPlan && !plan.isCurrentPlan && !plan.isAtCapacity
                ? () => onSelectPlan(plan._id)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
