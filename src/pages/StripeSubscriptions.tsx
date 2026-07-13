import { useMemo, useState } from "react";
import { format } from "date-fns";
import { usePaginatedQuery } from "convex/react";
import { CreditCard, Search } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPrice } from "@/pages/Payments/utils";
import {
  AutoRenewCell,
  SubscriptionRowActions,
  type SubscriptionRow,
} from "./StripeSubscriptions/SubscriptionRowActions";

type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "unpaid"
  | "incomplete"
  | "trialing";

const STATUS_OPTIONS: Array<{ value: "all" | SubscriptionStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "trialing", label: "Trialing" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled" },
  { value: "unpaid", label: "Unpaid" },
  { value: "incomplete", label: "Incomplete" },
];

function formatPeriod(startMs: number, endMs: number) {
  return `${format(new Date(startMs), "MMM d, yyyy")} – ${format(new Date(endMs), "MMM d, yyyy")}`;
}

function formatInterval(interval: string | null, intervalCount: number | null) {
  if (!interval) {
    return "—";
  }
  const count = intervalCount ?? 1;
  if (count === 1) {
    return interval;
  }
  return `every ${count} ${interval}s`;
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

const StripeSubscriptions = () => {
  const [statusFilter, setStatusFilter] = useState<"all" | SubscriptionStatus>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const queryArgs = useMemo(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      search: search.trim() || undefined,
    }),
    [statusFilter, search],
  );

  const { results, status, loadMore } = usePaginatedQuery(
    api.subscriptionsAdmin.listForTechAdmin,
    queryArgs,
    { initialNumItems: 50 },
  );

  const rows = results as SubscriptionRow[] | undefined;

  const handleSearch = () => {
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-8 w-8 text-primary" />
          Stripe Subscriptions
        </h1>
        <p className="text-muted-foreground mt-1">
          All subscriptions synced from Stripe — user, plan, price, billing period, auto-renewal, and
          status.
        </p>
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Subscription list</CardTitle>
          <CardDescription>
            Manage auto-renewal and scheduled renewal prices for active Stripe subscriptions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search by user name or email…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearch();
                    }
                  }}
                />
              </div>
              <Button variant="secondary" onClick={handleSearch}>
                Search
              </Button>
              {search && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchInput("");
                    setSearch("");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as "all" | SubscriptionStatus)}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Auto-renew</TableHead>
                  <TableHead>Current period</TableHead>
                  <TableHead>Stripe ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows === undefined ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                      Loading subscriptions…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                      No subscriptions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.subscriptionDocId}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.userName ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{row.userEmail ?? "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p>{row.planName ?? "—"}</p>
                          {row.isAdminGranted && (
                            <Badge variant="outline" className="text-xs">
                              Admin grant
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <p>
                            {row.priceAmount != null && row.priceCurrency
                              ? formatPrice(row.priceAmount, row.priceCurrency)
                              : "—"}
                          </p>
                          {row.hasScheduledRenewalPrice && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              Renews at{" "}
                              {row.renewalPriceAmount != null && row.renewalPriceCurrency
                                ? formatPrice(row.renewalPriceAmount, row.renewalPriceCurrency)
                                : "a different price"}
                              {row.renewalPlanName ? ` · ${row.renewalPlanName}` : ""}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">
                        {formatInterval(row.interval, row.intervalCount)}
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
                        <code className="text-xs text-muted-foreground">
                          {row.isStripeBacked ? row.subscriptionId : row.subscriptionId.slice(0, 24)}
                        </code>
                      </TableCell>
                      <TableCell className="text-right">
                        <SubscriptionRowActions row={row} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {status === "CanLoadMore" && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => loadMore(50)}>
                Load more
              </Button>
            </div>
          )}
          {status === "LoadingMore" && (
            <p className="text-center text-sm text-muted-foreground">Loading more…</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default StripeSubscriptions;
