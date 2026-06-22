import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { PlanPreviewCard, type PlanPreviewData } from "@/components/SubscriptionPlans/PlanPreviewCard";
import { PlanFeaturesEditor } from "@/components/SubscriptionPlans/PlanFeaturesEditor";
import { PlanCourseCategoryPicker } from "@/components/SubscriptionPlans/PlanCourseCategoryPicker";
import { BADGE_TAG_OPTIONS } from "@/components/SubscriptionPlans/planIcons";
import {
  DEFAULT_PLAN_THEME_INPUT,
  collapsePlanTheme,
  expandPlanTheme,
  type PlanFeature,
  type PlanThemeInput,
} from "../../shared/validation/plan";
import { slugify } from "@/lib/slugify";
import { resolvePlanFeaturesForDisplay } from "../../shared/planFeatureTemplate";
import {
  computePlanCourseStatsForCourseIds,
  resolveCourseIdsFromPickerData,
} from "../../shared/planCourseResolution";

export type PlanFormState = {
  name: string;
  nameAr: string;
  slug: string;
  billingInterval: "month" | "year";
  priceAmountDollars: string;
  priceCurrency: string;
  compareAtPriceDollars: string;
  priceSubtitle: string;
  theme: PlanThemeInput;
  badgeTag: (typeof BADGE_TAG_OPTIONS)[number]["value"];
  ribbonText: string;
  inheritsDescription: string;
  inheritsDescriptionAr: string;
  includeAllCourses: boolean;
  includedCourseIds: Id<"courses">[];
  includedCategoryIds: Id<"categories">[];
  features: PlanFeature[];
  displayOrder: number;
  isActive: boolean;
  maxCapacity: string;
};

const defaultFormState = (): PlanFormState => ({
  name: "",
  nameAr: "",
  slug: "",
  billingInterval: "month",
  priceAmountDollars: "",
  priceCurrency: "usd",
  compareAtPriceDollars: "",
  priceSubtitle: "",
  theme: { ...DEFAULT_PLAN_THEME_INPUT },
  badgeTag: "none",
  ribbonText: "",
  inheritsDescription: "",
  inheritsDescriptionAr: "",
  includeAllCourses: false,
  includedCourseIds: [],
  includedCategoryIds: [],
  features: [],
  displayOrder: 0,
  isActive: true,
  maxCapacity: "",
});

function dollarsToCents(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function getConvexErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data !== null && "message" in error.data) {
    return String((error.data as { message?: string }).message ?? fallback);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function syncPriceFields(dollars: string) {
  return { priceAmountDollars: dollars };
}

function parseMaxCapacity(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
}

export function useSubscriptionPlanEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const planId = !isNew && id ? (id as Id<"subscriptionPlans">) : undefined;

  const planDetail = useQuery(
    api.plans.getPlan,
    planId ? { planId } : "skip",
  );
  const pickerCourses = useQuery(api.plans.listCoursesForPicker);

  const createPlanWithStripe = useAction(api.plansStripe.createPlanWithStripe);
  const updatePlanPriceWithStripe = useAction(api.plansStripe.updatePlanPriceWithStripe);
  const updatePlan = useMutation(api.plans.updatePlan);
  const archivePlan = useMutation(api.plans.archivePlan);

  const [form, setForm] = useState<PlanFormState>(defaultFormState);
  const [newPriceDollars, setNewPriceDollars] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [initialized, setInitialized] = useState(isNew);

  const courseStats = useMemo(() => {
    if (!pickerCourses) {
      return planDetail?.courseStats ?? null;
    }

    const courseIds = resolveCourseIdsFromPickerData(
      {
        includeAllCourses: form.includeAllCourses,
        includedCourseIds: form.includedCourseIds,
        includedCategoryIds: form.includedCategoryIds,
      },
      pickerCourses,
    );
    return computePlanCourseStatsForCourseIds(courseIds, pickerCourses);
  }, [
    pickerCourses,
    planDetail?.courseStats,
    form.includeAllCourses,
    form.includedCourseIds,
    form.includedCategoryIds,
  ]);

  useEffect(() => {
    if (isNew || !planDetail?.plan || initialized) return;
    const p = planDetail.plan;
    setForm({
      name: p.name,
      nameAr: p.name_ar,
      slug: p.slug,
      billingInterval: p.billingInterval,
      priceAmountDollars: centsToDollars(p.priceAmount),
      priceCurrency: p.priceCurrency,
      compareAtPriceDollars: p.compareAtPriceAmount
        ? centsToDollars(p.compareAtPriceAmount)
        : "",
      priceSubtitle: p.priceSubtitle ?? "",
      theme: collapsePlanTheme(p.theme),
      badgeTag: p.badgeTag,
      ribbonText: p.ribbonText ?? "",
      inheritsDescription: p.inheritsDescription ?? "",
      inheritsDescriptionAr: p.inheritsDescription_ar ?? "",
      includeAllCourses: p.includeAllCourses,
      includedCourseIds: p.includedCourseIds,
      includedCategoryIds: p.includedCategoryIds,
      features: p.features.map((f) => ({
        icon: f.icon,
        title: f.title,
        titleAr: f.title_ar,
        subtitle: f.subtitle,
        subtitleAr: f.subtitle_ar,
        subtitleMode: f.subtitleMode ?? "manual",
        subtitleTemplate: f.subtitleTemplate,
        subtitleTemplateAr: f.subtitleTemplate_ar,
        isChecklistItem: f.isChecklistItem,
        displayOrder: f.displayOrder,
      })),
      displayOrder: p.displayOrder,
      isActive: p.isActive,
      maxCapacity: p.maxCapacity != null ? String(p.maxCapacity) : "",
    });
    setNewPriceDollars(centsToDollars(p.priceAmount));
    setInitialized(true);
  }, [planDetail, isNew, initialized]);

  const setField = useCallback(<K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && isNew && typeof value === "string") {
        next.slug = slugify(value);
      }
      return next;
    });
  }, [isNew]);

  const previewData: PlanPreviewData = useMemo(
    () => {
      const stats = courseStats ?? { courses: 0, lessons: 0, hours: 0 };
      const resolvedFeatures = resolvePlanFeaturesForDisplay(form.features, stats);
      return {
      name: form.name || "Plan name",
      name_ar: form.nameAr || "اسم الخطة",
      billingInterval: form.billingInterval,
      priceAmount: isNew
        ? dollarsToCents(form.priceAmountDollars) || 0
        : dollarsToCents(newPriceDollars) || planDetail?.plan.priceAmount || 0,
      priceCurrency: form.priceCurrency,
      compareAtPriceAmount: form.compareAtPriceDollars
        ? dollarsToCents(form.compareAtPriceDollars)
        : undefined,
      priceSubtitle: form.priceSubtitle || undefined,
      theme: expandPlanTheme(form.theme),
      badgeTag: form.badgeTag,
      ribbonText: form.ribbonText || undefined,
      features: resolvedFeatures.map((f) => ({
        icon: f.icon,
        title: f.title,
        title_ar: f.titleAr,
        subtitle: f.subtitle,
        subtitle_ar: f.subtitle_ar,
        isChecklistItem: f.isChecklistItem,
        displayOrder: f.displayOrder,
      })),
      inheritsDescription: form.inheritsDescription.trim() || undefined,
      inheritsDescription_ar: form.inheritsDescriptionAr.trim() || undefined,
      resolvedCourseCount: stats.courses,
      isActive: form.isActive,
    };
    },
    [form, planDetail?.plan.priceAmount, isNew, newPriceDollars, courseStats],
  );

  const applyPriceUpdate = useCallback(
    async (priceAmount: number) => {
      if (!planId) return;
      await updatePlanPriceWithStripe({ planId, priceAmount });
      const dollars = centsToDollars(priceAmount);
      setNewPriceDollars(dollars);
      setForm((prev) => ({ ...prev, ...syncPriceFields(dollars) }));
    },
    [planId, updatePlanPriceWithStripe],
  );

  const buildMutationArgs = () => ({
    name: form.name.trim(),
    nameAr: form.nameAr.trim(),
    slug: form.slug.trim(),
    compareAtPriceAmount: form.compareAtPriceDollars
      ? dollarsToCents(form.compareAtPriceDollars)
      : undefined,
    priceSubtitle: form.priceSubtitle.trim() || undefined,
    theme: expandPlanTheme(form.theme),
    badgeTag: form.badgeTag,
    ribbonText: form.ribbonText.trim() || undefined,
    inheritsDescription: form.inheritsDescription.trim() || undefined,
    inheritsDescriptionAr: form.inheritsDescriptionAr.trim() || undefined,
    includeAllCourses: form.includeAllCourses,
    includedCourseIds: form.includedCourseIds,
    includedCategoryIds: form.includedCategoryIds,
    features: form.features,
    displayOrder: form.displayOrder,
    isActive: form.isActive,
    maxCapacity: parseMaxCapacity(form.maxCapacity),
  });

  return {
    id,
    isNew,
    planId,
    planDetail,
    form,
    setField,
    setForm,
    previewData,
    newPriceDollars,
    setNewPriceDollars,
    isSaving,
    setIsSaving,
    isUpdatingPrice,
    setIsUpdatingPrice,
    showArchiveDialog,
    setShowArchiveDialog,
    isArchiving,
    setIsArchiving,
    createPlanWithStripe,
    updatePlan,
    archivePlan,
    applyPriceUpdate,
    buildMutationArgs,
    dollarsToCents,
    courseStats,
    initialized: isNew || initialized,
  };
}

const SubscriptionPlanEditor = () => {
  const navigate = useNavigate();
  const {
    isNew,
    planId,
    planDetail,
    form,
    setField,
    setForm,
    previewData,
    newPriceDollars,
    setNewPriceDollars,
    isSaving,
    setIsSaving,
    isUpdatingPrice,
    setIsUpdatingPrice,
    showArchiveDialog,
    setShowArchiveDialog,
    isArchiving,
    setIsArchiving,
    createPlanWithStripe,
    updatePlan,
    archivePlan,
    applyPriceUpdate,
    buildMutationArgs,
    dollarsToCents,
    courseStats,
    initialized,
  } = useSubscriptionPlanEditor();

  if (!isNew && planDetail === undefined) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isNew && planDetail === null) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Plan not found.</p>
        <Button variant="link" onClick={() => navigate("/subscription-plans")}>
          Back to plans
        </Button>
      </div>
    );
  }

  if (!initialized) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const args = buildMutationArgs();
      if (form.maxCapacity.trim() && args.maxCapacity === undefined) {
        toast.error("Max capacity must be a whole number of at least 1, or leave blank for unlimited.");
        return;
      }
      if (isNew) {
        const priceAmount = dollarsToCents(form.priceAmountDollars);
        if (priceAmount < 50) {
          toast.error("Enter a valid price (minimum $0.50).");
          return;
        }
        const newId = await createPlanWithStripe({
          name: args.name,
          name_ar: args.nameAr,
          slug: args.slug,
          billingInterval: form.billingInterval,
          priceAmount,
          priceCurrency: form.priceCurrency,
          compareAtPriceAmount: args.compareAtPriceAmount,
          priceSubtitle: args.priceSubtitle,
          theme: args.theme,
          badgeTag: args.badgeTag,
          ribbonText: args.ribbonText,
          inheritsDescription: args.inheritsDescription,
          inheritsDescription_ar: args.inheritsDescriptionAr,
          includeAllCourses: args.includeAllCourses,
          includedCourseIds: args.includedCourseIds,
          includedCategoryIds: args.includedCategoryIds,
          features: args.features.map((f) => ({
            icon: f.icon,
            title: f.title,
            title_ar: f.titleAr,
            subtitle: f.subtitle,
            subtitle_ar: f.subtitleAr,
            subtitleMode: f.subtitleMode,
            subtitleTemplate: f.subtitleTemplate,
            subtitleTemplate_ar: f.subtitleTemplateAr,
            isChecklistItem: f.isChecklistItem,
            displayOrder: f.displayOrder,
          })),
          displayOrder: args.displayOrder,
          isActive: args.isActive,
          maxCapacity: args.maxCapacity,
        });
        toast.success("Plan created.");
        navigate(`/subscription-plans/${newId}`);
      } else if (planId) {
        const priceAmount = dollarsToCents(newPriceDollars);
        if (priceAmount < 50) {
          toast.error("Enter a valid price (minimum $0.50).");
          return;
        }
        if (planDetail?.plan.priceAmount !== priceAmount) {
          await applyPriceUpdate(priceAmount);
        }
        await updatePlan({ planId, ...args });
        toast.success("Plan saved.");
      }
    } catch (error) {
      console.error(error);
      toast.error(getConvexErrorMessage(error, "Failed to save plan."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePrice = async () => {
    if (!planId) return;
    const priceAmount = dollarsToCents(newPriceDollars);
    if (priceAmount < 50) {
      toast.error("Enter a valid price.");
      return;
    }
    setIsUpdatingPrice(true);
    try {
      await applyPriceUpdate(priceAmount);
      toast.success("Price updated on Stripe.");
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Failed to update price."));
    } finally {
      setIsUpdatingPrice(false);
    }
  };

  const handleArchive = async () => {
    if (!planId) return;
    setIsArchiving(true);
    try {
      await archivePlan({ planId });
      toast.success("Plan archived.");
      navigate("/subscription-plans");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive plan.");
    } finally {
      setIsArchiving(false);
      setShowArchiveDialog(false);
    }
  };

  const themeFields: { key: keyof PlanThemeInput; label: string; hint: string }[] = [
    { key: "primary", label: "Primary", hint: "Price, button, icons" },
    { key: "secondary", label: "Secondary", hint: "Highlights & accents" },
    { key: "headerBg", label: "Header background", hint: "Top section fill" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/subscription-plans")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isNew ? "Create subscription plan" : `Edit: ${form.name}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure pricing, course access, and card appearance.
          </p>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name (EN)</Label>
                <Input value={form.name} onChange={(e) => setField("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Name (AR)</Label>
                <Input value={form.nameAr} onChange={(e) => setField("nameAr", e.target.value)} dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={form.slug} onChange={(e) => setField("slug", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Billing interval</Label>
                <Select
                  value={form.billingInterval}
                  onValueChange={(v) => setField("billingInterval", v as "month" | "year")}
                  disabled={!isNew}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Monthly</SelectItem>
                    <SelectItem value="year">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.5"
                  value={isNew ? form.priceAmountDollars : newPriceDollars}
                  onChange={(e) =>
                    isNew
                      ? setField("priceAmountDollars", e.target.value)
                      : setNewPriceDollars(e.target.value)
                  }
                  disabled={!isNew && false}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  value={form.priceCurrency}
                  onChange={(e) => setField("priceCurrency", e.target.value.toLowerCase())}
                  maxLength={3}
                  disabled={!isNew}
                />
              </div>
              <div className="space-y-2">
                <Label>Compare-at price (optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.compareAtPriceDollars}
                  onChange={(e) => setField("compareAtPriceDollars", e.target.value)}
                  placeholder="Old price for strikethrough"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Price subtitle</Label>
                <Input
                  value={form.priceSubtitle}
                  onChange={(e) => setField("priceSubtitle", e.target.value)}
                  placeholder="e.g. per year · 12 + 2 months free"
                />
              </div>
              <div className="space-y-2">
                <Label>Max capacity (optional)</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={form.maxCapacity}
                  onChange={(e) => setField("maxCapacity", e.target.value)}
                  placeholder="Unlimited"
                />
                <p className="text-xs text-muted-foreground">
                  {isNew
                    ? "Max active subscribers at once. Leave blank for unlimited."
                    : planDetail
                      ? `${planDetail.activeSubscriberCount} active now${
                          form.maxCapacity.trim()
                            ? ` · cap ${form.maxCapacity}`
                            : " · no cap"
                        }`
                      : "Max active subscribers at once."}
                </p>
              </div>
              {!isNew && (
                <div className="sm:col-span-2 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUpdatePrice}
                    disabled={isUpdatingPrice}
                  >
                    {isUpdatingPrice && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Update price on Stripe
                  </Button>
                  <p className="text-xs text-muted-foreground self-center">
                    Save changes also updates the price. Or use this button to update price only.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Promotion badge</Label>
                  <Select
                    value={form.badgeTag}
                    onValueChange={(v) =>
                      setField("badgeTag", v as PlanFormState["badgeTag"])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BADGE_TAG_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.labelKey.replace("planBadge", "")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ribbon text (optional)</Label>
                  <Input
                    value={form.ribbonText}
                    onChange={(e) => setField("ribbonText", e.target.value)}
                    placeholder="MOST POPULAR"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Border and button colors are derived from primary automatically.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {themeFields.map(({ key, label, hint }) => (
                  <div key={key} className="space-y-2">
                    <Label>{label}</Label>
                    <p className="text-[11px] text-muted-foreground -mt-1">{hint}</p>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={form.theme[key]}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            theme: { ...prev.theme, [key]: e.target.value },
                          }))
                        }
                        className="w-12 h-10 p-1"
                      />
                      <Input
                        value={form.theme[key]}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            theme: { ...prev.theme, [key]: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Course access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.includeAllCourses}
                  onCheckedChange={(v) => setField("includeAllCourses", v)}
                />
                <Label>Include all published courses</Label>
              </div>
              {!form.includeAllCourses && (
                <PlanCourseCategoryPicker
                  selectedCourseIds={form.includedCourseIds}
                  selectedCategoryIds={form.includedCategoryIds}
                  onCoursesChange={(ids) => setField("includedCourseIds", ids)}
                  onCategoriesChange={(ids) => setField("includedCategoryIds", ids)}
                />
              )}
              {planDetail && (
                <p className="text-sm text-muted-foreground">
                  Resolved: {planDetail.resolvedCourses.length} course
                  {planDetail.resolvedCourses.length !== 1 ? "s" : ""}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Inherits (optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Free text shown above the feature list, e.g. &quot;Everything in Monthly, plus&quot;
              </p>
              <div className="space-y-2">
                <Label>Inherits text (EN)</Label>
                <Input
                  value={form.inheritsDescription}
                  onChange={(e) => setField("inheritsDescription", e.target.value)}
                  placeholder="Everything in Monthly, plus"
                />
              </div>
              <div className="space-y-2">
                <Label>Inherits text (AR)</Label>
                <Input
                  value={form.inheritsDescriptionAr}
                  onChange={(e) => setField("inheritsDescriptionAr", e.target.value)}
                  placeholder="كل ما في الباقة الشهرية، بالإضافة إلى"
                  dir="rtl"
                  className="text-right"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Features</CardTitle>
            </CardHeader>
            <CardContent>
              <PlanFeaturesEditor
                features={form.features}
                courseStats={courseStats}
                onChange={(features) => setField("features", features)}
              />
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardContent className="pt-6 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={form.isActive} onCheckedChange={(v) => setField("isActive", v)} />
                <Label>Active</Label>
              </div>
              <div className="flex items-center gap-2">
                <Label>Display order</Label>
                <Input
                  type="number"
                  className="w-20"
                  value={form.displayOrder}
                  onChange={(e) => setField("displayOrder", parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button variant="cta" onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isNew ? "Create plan" : "Save changes"}
            </Button>
            {!isNew && (
              <Button variant="destructive" onClick={() => setShowArchiveDialog(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Archive plan
              </Button>
            )}
          </div>
        </div>

        <div className="xl:sticky xl:top-24 h-fit w-full max-w-[380px] xl:mx-auto space-y-3">
          <h2 className="text-lg font-semibold">Live preview</h2>
          <PlanPreviewCard plan={previewData} className="max-w-none" />
        </div>
      </div>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This soft-deletes the plan and deactivates its Stripe product. Existing subscriptions
              are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} disabled={isArchiving}>
              {isArchiving ? "Archiving…" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SubscriptionPlanEditor;
