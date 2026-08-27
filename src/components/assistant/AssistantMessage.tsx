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
import { translate, useLanguage } from "@/hooks/use-language";
import { resolveAssistantContentLanguage } from "./language";

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
  const { language } = useLanguage();
  const isUser = message.role === "user";
  const toolResults = isUser ? null : parseToolResultsFromMessage(message);
  const contentLanguage = resolveAssistantContentLanguage(
    message.text,
    language,
    toolResults?.courses ?? [],
  );
  const isContentRtl = contentLanguage === "ar";
  const visibleCallToActions =
    toolResults?.callToActions.length
      ? filterCallToActionsNotDuplicatedInText(toolResults.callToActions, message.text)
      : [];
  const coursesCatalog = toolResults?.coursesCatalog
    ? {
        message:
          contentLanguage === "ar"
            ? toolResults.coursesCatalog.messageAr
            : toolResults.coursesCatalog.messageEn,
        buttonText:
          contentLanguage === "ar"
            ? toolResults.coursesCatalog.buttonTextAr
            : toolResults.coursesCatalog.buttonTextEn,
        url:
          contentLanguage === "ar"
            ? toolResults.coursesCatalog.urlAr
            : toolResults.coursesCatalog.urlEn,
      }
    : null;
  const whatsAppSupport = toolResults?.whatsAppSupport
    ? {
        message:
          contentLanguage === "ar"
            ? toolResults.whatsAppSupport.messageAr
            : toolResults.whatsAppSupport.messageEn,
        buttonText:
          contentLanguage === "ar"
            ? toolResults.whatsAppSupport.buttonTextAr
            : toolResults.whatsAppSupport.buttonTextEn,
        url: toolResults.whatsAppSupport.url,
      }
    : null;

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "min-w-0 max-w-[92%] space-y-3 overflow-hidden rounded-2xl px-4 py-3 sm:max-w-[80%]",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border/60 bg-card/90 text-foreground",
          isContentRtl ? "assistant-rtl text-right" : "text-left",
        )}
        dir={isContentRtl ? "rtl" : "ltr"}
        lang={contentLanguage}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
        ) : (
          <>
            <AssistantText message={message} />
            {toolResults?.courses.length ? (
              <div className="grid gap-3">
                {toolResults.courses.map((course) => (
                  <CourseRecommendationCard
                    key={course.id}
                    course={course}
                    contentLanguage={contentLanguage}
                  />
                ))}
              </div>
            ) : null}
            {toolResults?.plans.length ? (
              <div className="grid gap-3">
                {toolResults.plans.map((plan) => (
                  <SubscriptionPlanCard
                    key={plan.id}
                    plan={plan}
                    contentLanguage={contentLanguage}
                  />
                ))}
              </div>
            ) : null}
            {toolResults?.subscription ? (
              <SubscriptionSummaryCard
                subscription={toolResults.subscription}
                billingPortalUrl={toolResults.billingPortalUrl}
                contentLanguage={contentLanguage}
              />
            ) : null}
            {!toolResults?.subscription && toolResults?.billingPortalUrl ? (
              <BillingPortalButton
                url={toolResults.billingPortalUrl}
                label={translate(contentLanguage, "assistantManageSubscription")}
              />
            ) : null}
            {visibleCallToActions.length ? (
              <div className="grid min-w-0 gap-2 pt-1">
                {visibleCallToActions.map((cta, index) => (
                  <AssistantCtaButton
                    key={`${cta.url}-${index}`}
                    text={cta.text}
                    url={cta.url}
                    language={contentLanguage}
                  />
                ))}
              </div>
            ) : null}
            {coursesCatalog ? (
              <div className="grid min-w-0 gap-2 pt-1">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {coursesCatalog.message}
                </p>
                <AssistantCtaButton
                  text={coursesCatalog.buttonText}
                  url={coursesCatalog.url}
                  language={contentLanguage}
                />
              </div>
            ) : null}
            {whatsAppSupport ? (
              <div className="grid min-w-0 gap-2 pt-1">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {whatsAppSupport.message}
                </p>
                <AssistantCtaButton
                  text={whatsAppSupport.buttonText}
                  url={whatsAppSupport.url}
                  language={contentLanguage}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
