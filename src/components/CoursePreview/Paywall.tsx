import { CheckCircle2, CreditCard, Loader2, Lock, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingCycleChoice } from "@/pages/Payments/BillingCycleChoice";
import type { PaymentSettings } from "@/pages/Payments/usePayments";
import type { Doc } from "../../../convex/_generated/dataModel";

type CourseDoc = Doc<"courses">;
type Subscription = {
  status: string;
};

type PriceSummary = {
  amount: string;
  interval: string;
  productName?: string;
};

type PaywallProps = {
  course: CourseDoc;
  subscription: Subscription | null;
  priceSummary: PriceSummary | null;
  paymentSettings: PaymentSettings | null | undefined;
  isPriceLoading: boolean;
  isStartingCheckout: boolean;
  onStartSubscription: (priceId?: string) => void;
  onBackToCourses: () => void;
  language: string;
  isRTL: boolean;
  t: (key: string) => string;
  translateInterval: (interval: string) => string;
};

export const Paywall = ({
  course,
  subscription,
  priceSummary,
  paymentSettings,
  isPriceLoading,
  isStartingCheckout,
  onStartSubscription,
  onBackToCourses,
  language,
  isRTL,
  t,
  translateInterval,
}: PaywallProps) => {
  const courseImageUrl = course.thumbnail_image_url ?? course.banner_image_url ?? "/RehamDivaLogo.png";
  const courseName = language === "ar" ? course.name_ar : course.name;
  const courseDescription = language === "ar"
    ? (course.short_description_ar ?? course.description_ar ?? course.short_description ?? course.description ?? t("unlockFullProgram"))
    : (course.short_description ?? course.description ?? t("unlockFullProgram"));

  return (
    <div className="flex h-full items-center justify-center p-4 md:p-10" dir={isRTL ? "rtl" : "ltr"}>
      <div className="w-full max-w-5xl space-y-6">
        <Card className="w-full overflow-hidden border border-border/40 dark:border-transparent bg-card/95 shadow-2xl">
          <div className="grid gap-0 lg:grid-cols-2">
            <div className="flex flex-col">
              <div className="relative flex min-h-[200px] flex-1 items-center justify-center bg-gradient-to-br from-primary/10 via-muted/50 to-primary/5 p-6">
                {courseImageUrl ? (
                  <img
                    src={courseImageUrl}
                    alt={`Preview of ${courseName}`}
                    className="max-h-64 w-full object-contain object-center"
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
                <p className="text-xl font-semibold leading-snug text-foreground">{courseName}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {courseDescription}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-6 p-6 md:p-10">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("membershipRequired")}</p>
                    <CardTitle className="text-3xl">{t("unlock")} {courseName}</CardTitle>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {subscription
                    ? `${t("subscriptionStatus")} ${subscription.status}. ${t("activateSubscription")}`
                    : t("activeSubscriptionDescription")}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("yourInvestment")}</p>
                {priceSummary?.productName && (
                  <p className="text-xs text-muted-foreground/80">{t("plan")}: {priceSummary.productName}</p>
                )}
              </div>

              {paymentSettings ? (
                <BillingCycleChoice
                  paymentSettings={paymentSettings}
                  isLoading={isStartingCheckout}
                  t={t}
                  translateInterval={translateInterval}
                  onSubscribe={onStartSubscription}
                  subscribeLabel={t("subscribeUnlock")}
                  variant="default"
                  isRTL={isRTL}
                />
              ) : isPriceLoading ? (
                <div className="space-y-3">
                  <div className="h-24 animate-pulse rounded-xl bg-muted" />
                  <Button variant="cta" className="w-full" disabled>
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{t("subscriptionPricing")}</p>
                  <Button variant="cta" className="w-full justify-center gap-2" disabled>
                    <CreditCard className="h-4 w-4" />
                    {t("subscribeUnlock")}
                  </Button>
                </div>
              )}

              <Button variant="ghost" className="w-full justify-center text-muted-foreground" onClick={onBackToCourses}>
                {t("backToCourses")}
              </Button>

              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("fullAccessAllCourses")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("liveMeetingsWithReham")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("audioOnlyMode")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("multiDeviceSupport")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("periodicNewContent")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("joinRehamDivaCommunity")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("trainingNotes")}
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

