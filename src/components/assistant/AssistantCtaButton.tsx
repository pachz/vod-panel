import { ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { trackPosthogEvent } from "@/lib/posthog";
import { isInternalAssistantPath } from "./assistantLinks";

type AssistantCtaButtonProps = {
  text: string;
  url: string;
};

export function AssistantCtaButton({ text, url }: AssistantCtaButtonProps) {
  const { localizedPath } = useLanguage();
  const isInternal = isInternalAssistantPath(url);

  const trackClick = () => {
    trackPosthogEvent("assistant_cta_clicked", { url, label: text });
  };

  if (isInternal) {
    return (
      <Button asChild variant="cta" size="lg" className="h-12 w-full text-base font-semibold sm:h-14 sm:text-lg">
        <Link to={localizedPath(url)} aria-label={text} onClick={trackClick}>
          {text}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="cta"
      size="lg"
      className="h-12 w-full text-base font-semibold sm:h-14 sm:text-lg"
      aria-label={text}
      onClick={() => {
        trackClick();
        window.open(url, "_blank", "noopener,noreferrer");
      }}
    >
      <ExternalLink className="h-5 w-5 me-2 shrink-0" />
      {text}
    </Button>
  );
}
