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
            <div className="relative h-64 w-full lg:h-full">
              {courseImageUrl ? (
                <img src={courseImageUrl} alt={`Preview of ${courseName}`} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-background via-muted to-background text-muted-foreground">
                  <Video className="h-10 w-10" />
                  <span className="text-sm font-medium">{t("premiumCourse")}</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 space-y-1 text-white">
                <p className="text-xs uppercase tracking-[0.35em] text-white/70">{t("premiumCourse")}</p>
                <p className="text-2xl font-semibold leading-snug">{courseName}</p>
                <p className="text-sm text-white/80 line-clamp-2">
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
                  {t("unlimitedStreaming")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("progressTracking")}
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  {t("bonusResources")}
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

