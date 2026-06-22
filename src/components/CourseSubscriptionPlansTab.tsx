import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const INCLUSION_LABELS = {
  direct: "Selected",
  category: "Via category",
  all_courses: "All courses",
  inheritance: "Via parent plan",
} as const;

type CourseSubscriptionPlansTabProps = {
  courseId: Id<"courses">;
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof ConvexError &&
    typeof error.data === "object" &&
    error.data !== null &&
    "message" in error.data
  ) {
    return String((error.data as { message?: string }).message ?? fallback);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function CourseSubscriptionPlansTab({ courseId }: CourseSubscriptionPlansTabProps) {
  const navigate = useNavigate();
  const membership = useQuery(api.plans.getCoursePlanMembership, { courseId });
  const addCourseToPlan = useMutation(api.plans.addCourseToPlan);
  const removeCourseFromPlan = useMutation(api.plans.removeCourseFromPlan);

  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [removingPlanId, setRemovingPlanId] = useState<Id<"subscriptionPlans"> | null>(null);

  const handleAdd = async () => {
    if (!selectedPlanId) return;
    setIsAdding(true);
    try {
      await addCourseToPlan({
        planId: selectedPlanId as Id<"subscriptionPlans">,
        courseId,
      });
      toast.success("Course added to plan");
      setSelectedPlanId("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to add course to plan"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (planId: Id<"subscriptionPlans">) => {
    setRemovingPlanId(planId);
    try {
      await removeCourseFromPlan({ planId, courseId });
      toast.success("Course removed from plan");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to remove course from plan"));
    } finally {
      setRemovingPlanId(null);
    }
  };

  if (membership === undefined) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading subscription plans…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add to plan</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a subscription plan…" />
              </SelectTrigger>
              <SelectContent>
                {membership.addablePlans.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No plans available
                  </SelectItem>
                ) : (
                  membership.addablePlans.map((plan) => (
                    <SelectItem key={plan._id} value={plan._id}>
                      {plan.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={!selectedPlanId || isAdding || membership.addablePlans.length === 0}
          >
            {isAdding ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add to plan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Included in {membership.includingPlans.length} plan
            {membership.includingPlans.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {membership.includingPlans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This course is not included in any subscription plans yet.
            </p>
          ) : (
            <div className="space-y-2">
              {membership.includingPlans.map((plan) => (
                <div
                  key={plan._id}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{plan.name}</p>
                    <p className="text-xs text-muted-foreground">{plan.slug}</p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {plan.billingInterval}
                  </Badge>
                  <Badge variant={plan.isActive ? "default" : "secondary"}>
                    {plan.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <Badge variant="secondary">{INCLUSION_LABELS[plan.inclusion]}</Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/subscription-plans/${plan._id}`)}
                  >
                    <ExternalLink className="mr-1 h-3.5 w-3.5" />
                    Edit plan
                  </Button>
                  {plan.canRemove && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      disabled={removingPlanId === plan._id}
                      onClick={() => handleRemove(plan._id)}
                      aria-label={`Remove from ${plan.name}`}
                    >
                      {removingPlanId === plan._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
