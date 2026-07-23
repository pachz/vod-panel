import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { cn } from "@/lib/utils";
import { CourseRecommendationCard } from "./CourseRecommendationCard";
import { SubscriptionPlanCard } from "./SubscriptionPlanCard";
import { SubscriptionSummaryCard } from "./SubscriptionSummaryCard";
import { BillingPortalButton } from "./BillingPortalButton";
import { parseToolResultsFromMessage } from "./parseToolResults";
import { formatAssistantMessageText } from "./formatAssistantText";
import { useLanguage } from "@/hooks/use-language";

type AssistantMessageProps = {
  message: UIMessage;
};

function AssistantText({ message }: { message: UIMessage }) {
  const [visibleText] = useSmoothText(message.text, {
    startStreaming: message.status === "streaming",
  });

  const displayText = formatAssistantMessageText(visibleText);
  if (!displayText) {
    return null;
  }

  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{displayText}</p>;
}

export function AssistantMessage({ message }: AssistantMessageProps) {
  const { t, isRTL } = useLanguage();
  const isUser = message.role === "user";
  const toolResults = isUser ? null : parseToolResultsFromMessage(message);

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div
        className={cn(
          "max-w-[92%] space-y-3 rounded-2xl px-4 py-3 sm:max-w-[80%]",
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
          </>
        )}
      </div>
    </div>
  );
}
