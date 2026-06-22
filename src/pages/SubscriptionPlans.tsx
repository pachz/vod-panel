import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { Plus, Pencil, Layers } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type TableColumn } from "@/components/DataTable";
import { formatPrice } from "@/pages/Payments/utils";
import { PlanPreviewRow, type PlanPreviewData } from "@/components/SubscriptionPlans/PlanPreviewCard";
import { BADGE_TAG_LABELS, type BadgeTag } from "@/components/SubscriptionPlans/planIcons";
import type { Id } from "../../convex/_generated/dataModel";

type PlanListItem = {
  _id: Id<"subscriptionPlans">;
  name: string;
  name_ar: string;
  slug: string;
  billingInterval: "month" | "year";
  priceAmount: number;
  priceCurrency: string;
  compareAtPriceAmount?: number;
  priceSubtitle?: string;
  theme: PlanPreviewData["theme"];
  badgeTag: BadgeTag;
  ribbonText?: string;
  features: PlanPreviewData["features"];
  displayOrder: number;
  isActive: boolean;
  resolvedCourseCount: number;
  activeSubscriberCount: number;
  maxCapacity?: number;
  inheritsDescription?: string;
  inheritsDescription_ar?: string;
};

const SubscriptionPlans = () => {
  const navigate = useNavigate();
  const plans = useQuery(api.plans.listPlans, {}) as PlanListItem[] | undefined;

  const previewPlans: PlanPreviewData[] = useMemo(() => {
    if (!plans) return [];
    return plans.map((p) => ({
      name: p.name,
      name_ar: p.name_ar,
      billingInterval: p.billingInterval,
      priceAmount: p.priceAmount,
      priceCurrency: p.priceCurrency,
      compareAtPriceAmount: p.compareAtPriceAmount,
      priceSubtitle: p.priceSubtitle,
      theme: p.theme,
      badgeTag: p.badgeTag,
      ribbonText: p.ribbonText,
      inheritsDescription: p.inheritsDescription,
      inheritsDescription_ar: p.inheritsDescription_ar,
      features: p.features,
      resolvedCourseCount: p.resolvedCourseCount,
      isActive: p.isActive,
    }));
  }, [plans]);

  const columns: TableColumn<PlanListItem>[] = [
    {
      header: "Name",
      render: (row) => (
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">{row.slug}</p>
        </div>
      ),
    },
    {
      header: "Interval",
      render: (row) => (
        <Badge variant="outline" className="capitalize">
          {row.billingInterval}
        </Badge>
      ),
    },
    {
      header: "Price",
      render: (row) => formatPrice(row.priceAmount, row.priceCurrency),
    },
    {
      header: "Badge",
      render: (row) =>
        row.badgeTag !== "none" ? (
          <Badge variant="secondary">{BADGE_TAG_LABELS[row.badgeTag]}</Badge>
        ) : (
          "—"
        ),
    },
    {
      header: "Capacity",
      render: (row) =>
        row.maxCapacity != null ? (
          <span className={row.activeSubscriberCount >= row.maxCapacity ? "text-destructive font-medium" : ""}>
            {row.activeSubscriberCount} / {row.maxCapacity}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {row.activeSubscriberCount} / ∞
          </span>
        ),
    },
    {
      header: "Courses",
      render: (row) => row.resolvedCourseCount,
    },
    {
      header: "Status",
      render: (row) => (
        <Badge variant={row.isActive ? "default" : "outline"}>
          {row.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-8 w-8" />
            Subscription Plans
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage pricing plans, course access, and preview how they appear to users.
          </p>
        </div>
        <Button variant="cta" onClick={() => navigate("/subscription-plans/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Create Plan
        </Button>
      </div>

      {plans && plans.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pricing preview</h2>
          <PlanPreviewRow plans={previewPlans} />
        </section>
      )}

      <DataTable
        data={plans ?? []}
        columns={columns}
        isLoading={plans === undefined}
        emptyMessage="No subscription plans yet. Create your first plan."
        getItemId={(row) => row._id}
        actions={[
          {
            label: "Edit",
            icon: Pencil,
            onClick: (row) => navigate(`/subscription-plans/${row._id}`),
          },
        ]}
      />
    </div>
  );
};

export default SubscriptionPlans;
