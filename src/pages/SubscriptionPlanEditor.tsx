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
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
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
import { LimitedInput, PlanIconSelect } from "@/components/SubscriptionPlans/planFormFields";
import { PlanCourseCategoryPicker } from "@/components/SubscriptionPlans/PlanCourseCategoryPicker";
import { BADGE_TAG_OPTIONS } from "@/components/SubscriptionPlans/planIcons";
import {
  DEFAULT_PLAN_THEME_INPUT,
  collapsePlanTheme,
  expandPlanTheme,
  type PlanFeature,
  type PlanThemeInput,
  PLAN_FIELD_LIMITS,
  planCreateInputSchema,
  planUpdateInputSchema,
} from "../../shared/validation/plan";
import {
  collectPlanFormFieldErrors,
  focusPlanFormField,
  formatPlanValidationMessage,
  getFirstPlanFormFieldErrorKey,
  PLAN_FORM_FIELD_IDS,
  type PlanFormFieldKey,
} from "../../shared/validation/planFormValidation";
import { slugify } from "@/lib/slugify";
import { cn } from "@/lib/utils";
import { resolvePlanFeaturesForDisplay } from "../../shared/planFeatureTemplate";
import {
  computePlanCourseStatsForCourseIds,
  resolveCourseIdsFromPickerData,
} from "../../shared/planCourseResolution";

export type PlanFormState = {
  name: string;
  nameAr: string;
  titleIcon: string;
  slug: string;
  billingInterval: "month" | "year";
  priceAmountDollars: string;
  priceCurrency: string;
  compareAtPriceDollars: string;
  priceSubtitle: string;
  priceSubtitleAr: string;
  theme: PlanThemeInput;
  badgeTag: (typeof BADGE_TAG_OPTIONS)[number]["value"];
  ribbonText: string;
  ribbonTextAr: string;
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
  titleIcon: "",
  slug: "",
  billingInterval: "month",
  priceAmountDollars: "",
  priceCurrency: "usd",
  compareAtPriceDollars: "",
  priceSubtitle: "",
  priceSubtitleAr: "",
  theme: { ...DEFAULT_PLAN_THEME_INPUT },
  badgeTag: "none",
  ribbonText: "",
  ribbonTextAr: "",
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

const FORM_KEY_TO_FIELD_ERROR: Partial<Record<keyof PlanFormState, PlanFormFieldKey>> = {
  name: "name",
  nameAr: "nameAr",
  slug: "slug",
  priceSubtitle: "priceSubtitle",
  priceSubtitleAr: "priceSubtitleAr",
  ribbonText: "ribbonText",
  ribbonTextAr: "ribbonTextAr",
  inheritsDescription: "inheritsDescription",
  inheritsDescriptionAr: "inheritsDescriptionAr",
  features: "features",
};

function parseMaxCapacity(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return undefined;
  }
  return parsed;
}

function PlanLivePreviewPanel({
  plan,
  className,
}: {
  plan: PlanPreviewData;
  className?: string;
}) {
  const [previewLanguage, setPreviewLanguage] = useState<"en" | "ar">("en");
  const useArabic = previewLanguage === "ar";

  return (
    <Card className={cn("card-elevated shadow-md", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b bg-muted/20 pb-3">
        <CardTitle className="text-base">Live preview</CardTitle>
        <ToggleGroup
          type="single"
          value={previewLanguage}
          onValueChange={(value) => {
            if (value === "en" || value === "ar") {
              setPreviewLanguage(value);
            }
          }}
          size="sm"
          variant="outline"
        >
          <ToggleGroupItem value="en" className="px-3 text-xs">
            EN
          </ToggleGroupItem>
          <ToggleGroupItem value="ar" className="px-3 text-xs">
            AR
          </ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent className="pt-4">
        <PlanPreviewCard
          plan={plan}
          useArabic={useArabic}
          isRTL={useArabic}
          className="mx-auto max-w-none"
        />
      </CardContent>
    </Card>
  );
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
  const [initialized, setInitialized] = useState(id === "new");

  useEffect(() => {
    if (id === "new") {
      setForm(defaultFormState());
      setNewPriceDollars("");
      setInitialized(true);
      return;
    }
    setInitialized(false);
  }, [id]);

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
    if (isNew || !planId || !planDetail?.plan || initialized) return;
    if (planDetail.plan._id !== planId) return;

    const p = planDetail.plan;
    setForm({
      name: p.name,
      nameAr: p.name_ar,
      titleIcon: p.titleIcon ?? "",
      slug: p.slug,
      billingInterval: p.billingInterval,
      priceAmountDollars: centsToDollars(p.priceAmount),
      priceCurrency: p.priceCurrency,
      compareAtPriceDollars: p.compareAtPriceAmount
        ? centsToDollars(p.compareAtPriceAmount)
        : "",
      priceSubtitle: p.priceSubtitle ?? "",
      priceSubtitleAr: p.priceSubtitle_ar ?? "",
      theme: collapsePlanTheme(p.theme),
      badgeTag: p.badgeTag,
      ribbonText: p.ribbonText ?? "",
      ribbonTextAr: p.ribbonText_ar ?? "",
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
  }, [planDetail, isNew, initialized, planId]);

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
      titleIcon: form.titleIcon || undefined,
      billingInterval: form.billingInterval,
      priceAmount: isNew
        ? dollarsToCents(form.priceAmountDollars) || 0
        : dollarsToCents(newPriceDollars) || planDetail?.plan.priceAmount || 0,
      priceCurrency: form.priceCurrency,
      compareAtPriceAmount: form.compareAtPriceDollars
        ? dollarsToCents(form.compareAtPriceDollars)
        : undefined,
      priceSubtitle: form.priceSubtitle.trim() || undefined,
      priceSubtitle_ar: form.priceSubtitleAr.trim() || undefined,
      theme: expandPlanTheme(form.theme),
      badgeTag: form.badgeTag,
      ribbonText: form.ribbonText.trim() || undefined,
      ribbonText_ar: form.ribbonTextAr.trim() || undefined,
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
    titleIcon: form.titleIcon.trim() || undefined,
    slug: form.slug.trim(),
    compareAtPriceAmount: form.compareAtPriceDollars
      ? dollarsToCents(form.compareAtPriceDollars)
      : undefined,
    priceSubtitle: form.priceSubtitle.trim() || undefined,
    priceSubtitleAr: form.priceSubtitleAr.trim() || undefined,
    theme: expandPlanTheme(form.theme),
    badgeTag: form.badgeTag,
    ribbonText: form.ribbonText.trim() || undefined,
    ribbonTextAr: form.ribbonTextAr.trim() || undefined,
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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PlanFormFieldKey, string>>>({});
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

  const clearFieldError = (key: keyof PlanFormState) => {
    const errorKey = FORM_KEY_TO_FIELD_ERROR[key];
    if (!errorKey) return;
    setFieldErrors((prev) => {
      if (!prev[errorKey]) return prev;
      const next = { ...prev };
      delete next[errorKey];
      return next;
    });
  };

  const updateField = <K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) => {
    clearFieldError(key);
    setField(key, value);
  };

  const validateBeforeSave = () => {
    const args = buildMutationArgs();
    const sharedPayload = {
      ...args,
      includedCourseIds: args.includedCourseIds.map(String),
      includedCategoryIds: args.includedCategoryIds.map(String),
    };

    const parsed = isNew
      ? planCreateInputSchema.safeParse({
          ...sharedPayload,
          billingInterval: form.billingInterval,
          priceAmount: dollarsToCents(form.priceAmountDollars),
          priceCurrency: form.priceCurrency || "usd",
        })
      : planUpdateInputSchema.safeParse(sharedPayload);

    if (parsed.success) {
      setFieldErrors({});
      return { ok: true as const, args, parsed: parsed.data };
    }

    const errors = collectPlanFormFieldErrors(parsed.error);
    setFieldErrors(errors);
    const firstKey = getFirstPlanFormFieldErrorKey(parsed.error);
    if (firstKey) {
      focusPlanFormField(firstKey);
    }
    toast.error(formatPlanValidationMessage(parsed.error));
    return { ok: false as const };
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const validation = validateBeforeSave();
      if (!validation.ok) return;

      const args = validation.args;
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
          titleIcon: args.titleIcon,
          billingInterval: form.billingInterval,
          priceAmount,
          priceCurrency: form.priceCurrency || "usd",
          compareAtPriceAmount: args.compareAtPriceAmount,
          priceSubtitle: args.priceSubtitle,
          priceSubtitle_ar: args.priceSubtitleAr,
          theme: args.theme,
          badgeTag: args.badgeTag,
          ribbonText: args.ribbonText,
          ribbonText_ar: args.ribbonTextAr,
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

      <PlanLivePreviewPanel plan={previewData} className="lg:hidden" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_min(400px,38%)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Basics</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={PLAN_FORM_FIELD_IDS.name}>Name (EN)</Label>
                <LimitedInput
                  id={PLAN_FORM_FIELD_IDS.name}
                  maxLength={PLAN_FIELD_LIMITS.name}
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  error={fieldErrors.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={PLAN_FORM_FIELD_IDS.nameAr}>Name (AR)</Label>
                <LimitedInput
                  id={PLAN_FORM_FIELD_IDS.nameAr}
                  maxLength={PLAN_FIELD_LIMITS.nameAr}
                  value={form.nameAr}
                  onChange={(e) => updateField("nameAr", e.target.value)}
                  dir="rtl"
                  className="text-right"
                  error={fieldErrors.nameAr}
                />
              </div>
              <div className="sm:col-span-2">
                <PlanIconSelect
                  value={form.titleIcon}
                  onChange={(value) => setField("titleIcon", value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={PLAN_FORM_FIELD_IDS.slug}>Slug</Label>
                <LimitedInput
                  id={PLAN_FORM_FIELD_IDS.slug}
                  maxLength={PLAN_FIELD_LIMITS.slug}
                  value={form.slug}
                  onChange={(e) => updateField("slug", e.target.value)}
                  error={fieldErrors.slug}
                />
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
              <div className="space-y-2">
                <Label>Max capacity (optional)</Label>
                <Input
                  type="number"
                  min="1"
                  max={PLAN_FIELD_LIMITS.maxCapacity}
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
              <div className="space-y-2">
                <Label htmlFor={PLAN_FORM_FIELD_IDS.priceSubtitle}>Price subtitle (EN)</Label>
                <LimitedInput
                  id={PLAN_FORM_FIELD_IDS.priceSubtitle}
                  maxLength={PLAN_FIELD_LIMITS.priceSubtitle}
                  value={form.priceSubtitle}
                  onChange={(e) => updateField("priceSubtitle", e.target.value)}
                  placeholder="e.g. per year · 12 + 2 months free"
                  error={fieldErrors.priceSubtitle}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={PLAN_FORM_FIELD_IDS.priceSubtitleAr}>Price subtitle (AR)</Label>
                <LimitedInput
                  id={PLAN_FORM_FIELD_IDS.priceSubtitleAr}
                  maxLength={PLAN_FIELD_LIMITS.priceSubtitle}
                  value={form.priceSubtitleAr}
                  onChange={(e) => updateField("priceSubtitleAr", e.target.value)}
                  placeholder="مثال: سنوياً · 12 + 2 أشهر مجاناً"
                  dir="rtl"
                  className="text-right"
                  error={fieldErrors.priceSubtitleAr}
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Price subtitle, ribbon, and feature section title must be filled in both languages or left empty in both.
              </p>
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
                <div className="space-y-2 sm:col-span-2">
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
                  <Label htmlFor={PLAN_FORM_FIELD_IDS.ribbonText}>Ribbon text (EN)</Label>
                  <LimitedInput
                    id={PLAN_FORM_FIELD_IDS.ribbonText}
                    maxLength={PLAN_FIELD_LIMITS.ribbonText}
                    value={form.ribbonText}
                    onChange={(e) => updateField("ribbonText", e.target.value)}
                    placeholder="MOST POPULAR"
                    error={fieldErrors.ribbonText}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={PLAN_FORM_FIELD_IDS.ribbonTextAr}>Ribbon text (AR)</Label>
                  <LimitedInput
                    id={PLAN_FORM_FIELD_IDS.ribbonTextAr}
                    maxLength={PLAN_FIELD_LIMITS.ribbonText}
                    value={form.ribbonTextAr}
                    onChange={(e) => updateField("ribbonTextAr", e.target.value)}
                    placeholder="الأكثر شعبية"
                    dir="rtl"
                    className="text-right"
                    error={fieldErrors.ribbonTextAr}
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
              <CardTitle>Feature section title (optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Short line above the feature list, e.g. &quot;Everything in Monthly, plus&quot;
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={PLAN_FORM_FIELD_IDS.inheritsDescription}>Feature section title (EN)</Label>
                  <LimitedInput
                    id={PLAN_FORM_FIELD_IDS.inheritsDescription}
                    maxLength={PLAN_FIELD_LIMITS.inheritsDescription}
                    value={form.inheritsDescription}
                    onChange={(e) => updateField("inheritsDescription", e.target.value)}
                    placeholder="Everything in Monthly, plus"
                    error={fieldErrors.inheritsDescription}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={PLAN_FORM_FIELD_IDS.inheritsDescriptionAr}>Feature section title (AR)</Label>
                  <LimitedInput
                    id={PLAN_FORM_FIELD_IDS.inheritsDescriptionAr}
                    maxLength={PLAN_FIELD_LIMITS.inheritsDescriptionAr}
                    value={form.inheritsDescriptionAr}
                    onChange={(e) => updateField("inheritsDescriptionAr", e.target.value)}
                    placeholder="كل ما في الباقة الشهرية، بالإضافة إلى"
                    dir="rtl"
                    className="text-right"
                    error={fieldErrors.inheritsDescriptionAr}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-elevated" id={PLAN_FORM_FIELD_IDS.features}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Features</CardTitle>
            </CardHeader>
            <CardContent>
              {fieldErrors.features && (
                <p className="mb-3 text-sm text-destructive" role="alert">
                  {fieldErrors.features}
                </p>
              )}
              <PlanFeaturesEditor
                features={form.features}
                courseStats={courseStats}
                onChange={(features) => updateField("features", features)}
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
                  min={0}
                  max={PLAN_FIELD_LIMITS.displayOrder}
                  value={form.displayOrder}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    const next = Number.isFinite(parsed)
                      ? Math.min(PLAN_FIELD_LIMITS.displayOrder, Math.max(0, parsed))
                      : 0;
                    setField("displayOrder", next);
                  }}
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

        <aside className="hidden lg:sticky lg:top-20 lg:self-start lg:block">
          <PlanLivePreviewPanel plan={previewData} />
        </aside>
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
