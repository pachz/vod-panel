import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { CreditCard, GitCompareArrows, Search } from "lucide-react";
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
import { formatPrice } from "@/pages/Payments/utils";
import type { SubscriptionRow } from "./StripeSubscriptions/SubscriptionRowActions";
import { StripeSubscriptionsTable } from "./StripeSubscriptions/StripeSubscriptionsTable";

type SubscriptionStatus =
  | "active"
  | "past_due"
  | "unpaid"
  | "incomplete"
  | "trialing";

type StripePriceDisplay = {
  stripePriceId: string;
  planName: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  interval: string | null;
};

type PriceGroup = {
  key: string;
  stripePriceId: string | null;
  planName: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  interval: string | null;
  isUnlinkedStripePrice: boolean;
  rows: SubscriptionRow[];
};

const STATUS_OPTIONS: Array<{ value: "all" | SubscriptionStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "trialing", label: "Trialing" },
  { value: "past_due", label: "Past due" },
  { value: "unpaid", label: "Unpaid" },
  { value: "incomplete", label: "Incomplete" },
];

function formatInterval(interval: string | null) {
  if (!interval) {
    return null;
  }
  return interval;
}

function groupLabel(group: PriceGroup) {
  const price =
    group.priceAmount != null && group.priceCurrency
      ? formatPrice(group.priceAmount, group.priceCurrency)
      : null;
  const interval = formatInterval(group.interval);
  const name = group.planName ?? "Unknown Stripe price";
  const parts = [name];
  if (price) {
    parts.push(interval ? `${price} / ${interval}` : price);
  }
  if (group.isUnlinkedStripePrice) {
    parts.push("(Stripe only)");
  }
  return parts.join(" · ");
}

function groupByStripePrice(
  rows: SubscriptionRow[],
  stripePriceLookup: Map<string, StripePriceDisplay>,
): PriceGroup[] {
  const groups = new Map<string, PriceGroup>();

  for (const row of rows) {
    const key = row.stripePriceId ?? "unknown-price";
    const stripeLookup = row.stripePriceId ? stripePriceLookup.get(row.stripePriceId) : undefined;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }

    const hasInternalPlan = row.planName != null && row.priceAmount != null;
    groups.set(key, {
      key,
      stripePriceId: row.stripePriceId,
      planName: row.planName ?? stripeLookup?.planName ?? null,
      priceAmount: row.priceAmount ?? stripeLookup?.priceAmount ?? null,
      priceCurrency: row.priceCurrency ?? stripeLookup?.priceCurrency ?? null,
      interval: row.interval ?? stripeLookup?.interval ?? null,
      isUnlinkedStripePrice: !hasInternalPlan && row.stripePriceId != null,
      rows: [row],
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      rows: group.rows.sort((a, b) => b.updatedAt - a.updatedAt),
    }))
    .sort((a, b) => {
      const nameCompare = (a.planName ?? "").localeCompare(b.planName ?? "");
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return (b.priceAmount ?? 0) - (a.priceAmount ?? 0);
    });
}

const StripeSubscriptions = () => {
  const [statusFilter, setStatusFilter] = useState<"all" | SubscriptionStatus>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stripePriceLookup, setStripePriceLookup] = useState<Map<string, StripePriceDisplay>>(
    () => new Map(),
  );

  const lookupStripePrices = useAction(api.subscriptionsAdminStripe.lookupStripePriceDisplays);

  const queryArgs = useMemo(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      search: search.trim() || undefined,
    }),
    [statusFilter, search],
  );

  const rows = useQuery(api.subscriptionsAdmin.listForTechAdmin, queryArgs) as
    | SubscriptionRow[]
    | undefined;

  const priceIdsNeedingLookup = useMemo(() => {
    if (!rows) {
      return [];
    }
    const ids = new Set<string>();
    for (const row of rows) {
      if (
        row.stripePriceId &&
        (row.planName == null || row.priceAmount == null || row.priceCurrency == null)
      ) {
        ids.add(row.stripePriceId);
      }
      if (
        row.renewalStripePriceId &&
        row.hasScheduledRenewalPrice &&
        (row.renewalPlanName == null ||
          row.renewalPriceAmount == null ||
          row.renewalPriceCurrency == null)
      ) {
        ids.add(row.renewalStripePriceId);
      }
    }
    return [...ids].sort();
  }, [rows]);

  useEffect(() => {
    if (priceIdsNeedingLookup.length === 0) {
      setStripePriceLookup(new Map());
      return;
    }

    let cancelled = false;

    void lookupStripePrices({ stripePriceIds: priceIdsNeedingLookup })
      .then((displays) => {
        if (cancelled) {
          return;
        }
        setStripePriceLookup(new Map(displays.map((display) => [display.stripePriceId, display])));
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        console.error("Failed to load Stripe price details:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [lookupStripePrices, priceIdsNeedingLookup]);

  const priceGroups = useMemo(
    () => groupByStripePrice(rows ?? [], stripePriceLookup),
    [rows, stripePriceLookup],
  );

  const handleSearch = () => {
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-8 w-8 text-primary" />
            Stripe Subscriptions
          </h1>
          <p className="text-muted-foreground mt-1">
            Stripe-backed subscriptions only, grouped by current Stripe price.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/stripe-subscriptions/sync">
            <GitCompareArrows className="mr-2 h-4 w-4" />
            Stripe sync check
          </Link>
        </Button>
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Search and filter Stripe subscriptions. Results are split into one table per Stripe
            price.
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
        </CardContent>
      </Card>

      {rows === undefined ? (
        <Card className="card-elevated">
          <CardContent className="py-12 text-center text-muted-foreground">
            Loading Stripe subscriptions…
          </CardContent>
        </Card>
      ) : priceGroups.length === 0 ? (
        <Card className="card-elevated">
          <CardContent className="py-12 text-center text-muted-foreground">
            No Stripe subscriptions found.
          </CardContent>
        </Card>
      ) : (
        priceGroups.map((group) => (
          <Card key={group.key} className="card-elevated">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>{groupLabel(group)}</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    {group.stripePriceId ?? "No Stripe price ID"}
                  </CardDescription>
                </div>
                <Badge variant="secondary">
                  {group.rows.length} subscription{group.rows.length === 1 ? "" : "s"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <StripeSubscriptionsTable rows={group.rows} stripePriceLookup={stripePriceLookup} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

export default StripeSubscriptions;
