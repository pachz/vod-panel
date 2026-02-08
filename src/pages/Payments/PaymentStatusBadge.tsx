import { Badge } from "@/components/ui/badge";

type PaymentStatusBadgeProps = {
  status: string;
  t: (key: string) => string;
};

export function PaymentStatusBadge({ status, t }: PaymentStatusBadgeProps) {
  switch (status) {
    case "active":
      return <Badge variant="default" className="bg-green-500">{t("active")}</Badge>;
    case "trialing":
      return <Badge variant="default" className="bg-blue-500">{t("trialing")}</Badge>;
    case "expired":
      return <Badge variant="secondary">{t("expired")}</Badge>;
    case "past_due":
      return <Badge variant="destructive">{t("pastDue")}</Badge>;
    case "canceled":
      return <Badge variant="secondary">{t("canceled")}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
