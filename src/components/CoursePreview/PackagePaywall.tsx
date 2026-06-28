import { useState } from "react";
import { CheckCircle2, Layers, Lock, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { PackagePlanCompactList } from "@/components/SubscriptionPlans/PackagePlanCompactList";
import type { PackagePlan } from "@/components/SubscriptionPlans/PackagePlansGrid";
import { PlanCompareModal } from "./PlanCompareModal";

type CourseDoc = Doc<"courses">;

type PackagePaywallProps = {
  course: CourseDoc;
  plans: PackagePlan[];
  paywallMode: "packages_subscribe" | "packages_upgrade";
  isProcessing: boolean;
  processingPlanId: Id<"subscriptionPlans"> | null;
  onSelectPlan: (planId: Id<"subscriptionPlans">) => void;
  onBackToCourses: () => void;
  language: string;
  isRTL: boolean;
  t: (key: string) => string;
};

export const PackagePaywall = ({
  course,
  plans,
  paywallMode,
  isProcessing,
  processingPlanId,
  onSelectPlan,
  onBackToCourses,
  language,
  isRTL,
  t,
}: PackagePaywallProps) => {
  const [compareOpen, setCompareOpen] = useState(false);
  const useArabic = language === "ar";
  const isUpgradeMode = paywallMode === "packages_upgrade";

  const courseImageUrl = course.thumbnail_image_url ?? course.banner_image_url ?? "/RehamDivaLogo.png";
  const courseName = useArabic ? course.name_ar : course.name;
  const courseDescription = useArabic
    ? (course.short_description_ar ?? course.description_ar ?? course.short_description ?? course.description ?? t("unlockFullProgram"))
    : (course.short_description ?? course.description ?? t("unlockFullProgram"));

  return (
    <div className="flex h-full items-center justify-center p-4 md:p-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="w-full max-w-5xl">
        <Card className="w-full overflow-hidden border border-border/40 bg-card/95 shadow-2xl">
          <div className="grid gap-0 lg:grid-cols-2">
            <div className="flex flex-col">
              <div className="relative flex min-h-[180px] flex-1 items-center justify-center bg-gradient-to-br from-primary/10 via-muted/50 to-primary/5 p-6 lg:min-h-[240px]">
                {courseImageUrl ? (
                  <img
                    src={courseImageUrl}
                    alt={`Preview of ${courseName}`}
                    className="max-h-52 w-full object-contain object-center lg:max-h-56"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <Video className="h-10 w-10" />
                    <span className="text-sm font-medium">{t("premiumCourse")}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1 border-t border-border/40 bg-card/50 px-6 py-4">
                <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">{t("premiumCourse")}</p>
                <p className="text-lg font-semibold leading-snug text-foreground">{courseName}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{courseDescription}</p>
              </div>
            </div>

            <div className="flex flex-col gap-4 p-6 md:p-8">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("membershipRequired")}</p>
                    <CardTitle className="text-2xl leading-tight">
                      {t("unlock")} {courseName}
                    </CardTitle>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {isUpgradeMode
                    ? t("packagePaywallUpgradeDescription")
                    : t("packagePaywallSubscribeDescription")}
                </p>
              </div>

              {plans.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {t("packagePaywallNoPlans")}
                </div>
              ) : (
                <div className="space-y-3">
                  <PackagePlanCompactList
                    plans={plans}
                    useArabic={useArabic}
                    isUpgradeMode={isUpgradeMode}
                    isProcessing={isProcessing}
                    processingPlanId={processingPlanId}
                    onSelectPlan={onSelectPlan}
                    subscribeLabel={t("subscribeUnlock")}
                    upgradeLabel={t("packagePaywallUpgrade")}
                    currentPlanLabel={t("packagePaywallCurrentPlan")}
                    unavailableLabel={t("packagePaywallUnavailable")}
                  />

                  {plans.length > 1 && (
                    <Button
                      variant="outline"
                      className="w-full justify-center gap-2"
                      onClick={() => setCompareOpen(true)}
                    >
                      <Layers className="h-4 w-4" />
                      {t("packagePaywallComparePlans")}
                    </Button>
                  )}
                </div>
              )}

              <Button variant="ghost" className="w-full justify-center text-muted-foreground" onClick={onBackToCourses}>
                {t("backToCourses")}
              </Button>

              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {t("packagePaywallFeatureCourses")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {t("liveMeetingsWithReham")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {t("joinRehamDivaCommunity")}
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <PlanCompareModal
        open={compareOpen}
        onOpenChange={setCompareOpen}
        plans={plans}
        courseName={courseName}
        isRTL={isRTL}
        useArabic={useArabic}
        title={t("packagePaywallComparePlans")}
        description={t("packagePaywallCompareDescription")}
        subscribeLabel={t("subscribeUnlock")}
        upgradeLabel={t("packagePaywallUpgrade")}
        currentPlanLabel={t("packagePaywallCurrentPlan")}
        unavailableLabel={t("packagePaywallUnavailable")}
        loadingPlanId={processingPlanId}
        paywallMode={paywallMode}
        onSelectPlan={(planId) => onSelectPlan(planId as Id<"subscriptionPlans">)}
      />
    </div>
  );
};
