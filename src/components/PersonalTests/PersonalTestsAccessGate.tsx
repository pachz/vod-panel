import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";

import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useLanguage } from "@/hooks/use-language";
import { PersonalTestsPaywall } from "./PersonalTestsPaywall";

type AccessState = FunctionReturnType<typeof api.personalTestAccess.getPersonalTestAccessState>;

type PersonalTestsAccessContextValue = {
  now: number;
  access: AccessState;
};

const PersonalTestsAccessContext = createContext<PersonalTestsAccessContextValue | null>(
  null,
);

export function usePersonalTestsAccess() {
  const value = useContext(PersonalTestsAccessContext);
  if (!value) {
    throw new Error("usePersonalTestsAccess must be used inside PersonalTestsAccessGate");
  }
  return value;
}

export function PersonalTestsAccessGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { language, t, isRTL, localizedPath } = useLanguage();
  const [now] = useState(() => Date.now());
  const [processingPlanId, setProcessingPlanId] = useState<Id<"subscriptionPlans"> | null>(
    null,
  );

  const access = useQuery(api.personalTestAccess.getPersonalTestAccessState, { now });
  const createPlanCheckoutSession = useAction(api.plansStripe.createPlanCheckoutSession);
  const upgradePlanSubscription = useAction(api.plansStripe.upgradePlanSubscription);

  if (access === undefined) {
    return (
      <p className="text-muted-foreground" dir={isRTL ? "rtl" : "ltr"}>
        {t("loading")}
      </p>
    );
  }

  if (!access.canAccess) {
    const paywallMode = access.paywallMode ?? "packages_subscribe";

    const handlePlanSelection = async (planId: Id<"subscriptionPlans">) => {
      setProcessingPlanId(planId);

      try {
        if (paywallMode === "packages_upgrade") {
          const result = await upgradePlanSubscription({ planId });
          toast.success(result.message);
          return;
        }

        const checkoutUrl = await createPlanCheckoutSession({ planId });
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }

        toast.error(t("packagePaywallCheckoutError"));
      } catch (error) {
        console.error(error);
        const message =
          error instanceof Error && error.message
            ? error.message
            : t("packagePaywallCheckoutError");
        toast.error(message);
      } finally {
        setProcessingPlanId(null);
      }
    };

    return (
      <PersonalTestsPaywall
        plans={access.plans}
        paywallMode={paywallMode}
        isProcessing={processingPlanId !== null}
        processingPlanId={processingPlanId}
        onSelectPlan={handlePlanSelection}
        onBack={() => navigate(localizedPath("/user-dashboard"))}
        language={language}
        isRTL={isRTL}
        t={t}
      />
    );
  }

  return (
    <PersonalTestsAccessContext.Provider value={{ now, access }}>
      {children}
    </PersonalTestsAccessContext.Provider>
  );
}
