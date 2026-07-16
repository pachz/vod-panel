import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPrice } from "@/pages/Payments/utils";
import { AutoRenewCell, SubscriptionRowActions, type SubscriptionRow } from "./SubscriptionRowActions";

type StripePriceDisplay = {
  stripePriceId: string;
  planName: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  interval: string | null;
};

type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "unpaid"
  | "incomplete"
  | "trialing";

function formatPeriod(startMs: number, endMs: number) {
  return `${format(new Date(startMs), "MMM d, yyyy")} – ${format(new Date(endMs), "MMM d, yyyy")}`;
}

function statusBadgeVariant(status: SubscriptionStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
    case "trialing":
      return "default";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "destructive";
    case "canceled":
      return "secondary";
    default:
      return "outline";
  }
}

export function StripeSubscriptionsTable({
  rows,
  stripePriceLookup,
}: {
  rows: SubscriptionRow[];
  stripePriceLookup: Map<string, StripePriceDisplay>;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">No subscriptions on this price.</p>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Auto-renew</TableHead>
            <TableHead>Current period</TableHead>
            <TableHead>Renewal price</TableHead>
            <TableHead>Stripe ID</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const renewalLookup = row.renewalStripePriceId
              ? stripePriceLookup.get(row.renewalStripePriceId)
              : undefined;
            const renewalAmount =
              row.renewalPriceAmount ?? renewalLookup?.priceAmount ?? null;
            const renewalCurrency =
              row.renewalPriceCurrency ?? renewalLookup?.priceCurrency ?? null;
            const renewalName = row.renewalPlanName ?? renewalLookup?.planName ?? null;

            return (
            <TableRow key={row.subscriptionDocId}>
              <TableCell>
                <div>
                  <p className="font-medium">{row.userName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{row.userEmail ?? "—"}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant(row.status)} className="capitalize">
                  {row.status.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell>
                <AutoRenewCell row={row} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {formatPeriod(row.currentPeriodStart, row.currentPeriodEnd)}
              </TableCell>
              <TableCell>
                {row.hasScheduledRenewalPrice ? (
                  <div className="space-y-1 text-sm">
                    <p className="text-amber-700 dark:text-amber-400">
                      {renewalAmount != null && renewalCurrency
                        ? formatPrice(renewalAmount, renewalCurrency)
                        : "Different price"}
                    </p>
                    {renewalName && (
                      <p className="text-xs text-muted-foreground">{renewalName}</p>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Same as current</span>
                )}
              </TableCell>
              <TableCell>
                <code className="text-xs text-muted-foreground">{row.subscriptionId}</code>
              </TableCell>
              <TableCell className="text-right">
                <SubscriptionRowActions row={row} />
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
