import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { pathForLanguage, useLanguage, type Language } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { isInternalAssistantPath } from "./assistantLinks";

type AssistantCtaButtonProps = {
  text: string;
  url: string;
  language?: Language;
};

export function AssistantCtaButton({ text, url, language }: AssistantCtaButtonProps) {
  const { language: uiLanguage } = useLanguage();
  const displayLanguage = language ?? uiLanguage;
  const isInternal = isInternalAssistantPath(url);
  const href = isInternal ? pathForLanguage(url, displayLanguage) : url;

  const trackClick = () => {
    trackPosthogEvent("assistant_cta_clicked", { url, label: text });
  };

  const buttonClassName =
    "h-auto min-h-12 w-full min-w-0 max-w-full whitespace-normal px-4 text-base font-semibold leading-snug sm:min-h-14 sm:text-lg";

  if (isInternal) {
    return (
      <Button asChild variant="cta" size="lg" className={buttonClassName}>
        <Link to={href} aria-label={text} onClick={trackClick}>
          <span className="text-balance text-center">{text}</span>
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="cta"
      size="lg"
      className={buttonClassName}
      aria-label={text}
      onClick={() => {
        trackClick();
        window.open(href, "_blank", "noopener,noreferrer");
      }}
    >
      <ExternalLink className="h-5 w-5 shrink-0" />
      <span className="text-balance text-center">{text}</span>
    </Button>
  );
}
