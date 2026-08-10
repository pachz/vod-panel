import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { cn } from "@/lib/utils";
import { CourseRecommendationCard } from "./CourseRecommendationCard";
import { SubscriptionPlanCard } from "./SubscriptionPlanCard";
import { SubscriptionSummaryCard } from "./SubscriptionSummaryCard";
import { BillingPortalButton } from "./BillingPortalButton";
import { AssistantCtaButton } from "./AssistantCtaButton";
import { parseToolResultsFromMessage } from "./parseToolResults";
import { AssistantRichText } from "./formatAssistantText";
import { filterCallToActionsNotDuplicatedInText } from "./assistantLinks";
import { useLanguage } from "@/hooks/use-language";

type AssistantMessageProps = {
  message: UIMessage;
};

function AssistantText({ message }: { message: UIMessage }) {
  const [visibleText] = useSmoothText(message.text, {
    startStreaming: message.status === "streaming",
  });

  return (
    <AssistantRichText
      text={visibleText}
      className="whitespace-pre-wrap text-sm leading-relaxed"
    />
  );
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  const { t, isRTL, language } = useLanguage();
  const isUser = message.role === "user";
  const toolResults = isUser ? null : parseToolResultsFromMessage(message);
  const visibleCallToActions =
    toolResults?.callToActions.length
      ? filterCallToActionsNotDuplicatedInText(toolResults.callToActions, message.text)
      : [];
  const coursesCatalog = toolResults?.coursesCatalog
    ? {
        message:
          language === "ar"
            ? toolResults.coursesCatalog.messageAr
            : toolResults.coursesCatalog.messageEn,
        buttonText:
          language === "ar"
            ? toolResults.coursesCatalog.buttonTextAr
            : toolResults.coursesCatalog.buttonTextEn,
        url:
          language === "ar"
            ? toolResults.coursesCatalog.urlAr
            : toolResults.coursesCatalog.urlEn,
      }
    : null;
  const whatsAppSupport = toolResults?.whatsAppSupport
    ? {
        message:
          language === "ar"
            ? toolResults.whatsAppSupport.messageAr
            : toolResults.whatsAppSupport.messageEn,
        buttonText:
          language === "ar"
            ? toolResults.whatsAppSupport.buttonTextAr
            : toolResults.whatsAppSupport.buttonTextEn,
        url: toolResults.whatsAppSupport.url,
      }
    : null;

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div
        className={cn(
          "min-w-0 max-w-[92%] space-y-3 overflow-hidden rounded-2xl px-4 py-3 sm:max-w-[80%]",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border/60 bg-card/90 text-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
        ) : (
          <>
            <AssistantText message={message} />
            {toolResults?.courses.length ? (
              <div className="grid gap-3">
                {toolResults.courses.map((course) => (
                  <CourseRecommendationCard key={course.id} course={course} />
                ))}
              </div>
            ) : null}
            {toolResults?.plans.length ? (
              <div className="grid gap-3">
                {toolResults.plans.map((plan) => (
                  <SubscriptionPlanCard key={plan.id} plan={plan} />
                ))}
              </div>
            ) : null}
            {toolResults?.subscription ? (
              <SubscriptionSummaryCard
                subscription={toolResults.subscription}
                billingPortalUrl={toolResults.billingPortalUrl}
              />
            ) : null}
            {!toolResults?.subscription && toolResults?.billingPortalUrl ? (
              <BillingPortalButton
                url={toolResults.billingPortalUrl}
                label={t("assistantManageSubscription")}
              />
            ) : null}
            {visibleCallToActions.length ? (
              <div className="grid min-w-0 gap-2 pt-1">
                {visibleCallToActions.map((cta, index) => (
                  <AssistantCtaButton
                    key={`${cta.url}-${index}`}
                    text={cta.text}
                    url={cta.url}
                  />
                ))}
              </div>
            ) : null}
            {coursesCatalog ? (
              <div className="grid min-w-0 gap-2 pt-1">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {coursesCatalog.message}
                </p>
                <AssistantCtaButton text={coursesCatalog.buttonText} url={coursesCatalog.url} />
              </div>
            ) : null}
            {whatsAppSupport ? (
              <div className="grid min-w-0 gap-2 pt-1">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {whatsAppSupport.message}
                </p>
                <AssistantCtaButton text={whatsAppSupport.buttonText} url={whatsAppSupport.url} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
