import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackPosthogEvent } from "@/lib/posthog";

type BillingPortalButtonProps = {
  url: string;
  label: string;
};

export function BillingPortalButton({ url, label }: BillingPortalButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full sm:w-auto"
      aria-label={label}
      onClick={() => {
        trackPosthogEvent("assistant_billing_portal_opened");
        window.open(url, "_blank", "noopener,noreferrer");
      }}
    >
      <ExternalLink className="h-4 w-4 me-2" />
      {label}
    </Button>
  );
}
