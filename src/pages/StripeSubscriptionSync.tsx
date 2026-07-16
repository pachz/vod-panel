import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  GitCompareArrows,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/pages/Payments/utils";
import {
  clearPersistedSyncPageState,
  readPersistedSyncPageState,
  writePersistedSyncPageState,
  type ComparisonRow,
  type StatusFilter,
  type ViewFilter,
} from "@/pages/StripeSubscriptions/syncPageState";

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All Stripe statuses" },
  { value: "active", label: "Active" },
  { value: "trialing", label: "Trialing" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled" },
  { value: "unpaid", label: "Unpaid" },
  { value: "incomplete", label: "Incomplete" },
];

function formatPeriod(startMs: number, endMs: number) {
  if (startMs <= 0 || endMs <= 0) {
    return "—";
  }
  return `${format(new Date(startMs), "MMM d, yyyy")} – ${format(new Date(endMs), "MMM d, yyyy")}`;
}

function userLabel(name: string | null, email: string | null) {
  if (name && email) {
    return { title: name, subtitle: email };
  }
  return { title: name ?? email ?? "—", subtitle: name && email ? email : null };
}

function SyncStatusBadge({ row }: { row: ComparisonRow }) {
  if (row.syncNeeded) {
    if (!row.canSync) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Cannot sync
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1 text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-3 w-3" />
        Needs sync
      </Badge>
    );
  }

  if (row.needsPackageAssignment) {
    return (
      <Badge variant="secondary" className="gap-1 text-amber-800 dark:text-amber-300">
        <Package className="h-3 w-3" />
        Needs package
      </Badge>
    );
  }

  if (row.expectedDifferences.length > 0) {
    return (
      <Badge variant="outline" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        OK (package override)
      </Badge>
    );
  }

  return (
    <Badge variant="default" className="gap-1">
      <CheckCircle2 className="h-3 w-3" />
      In sync
    </Badge>
  );
}

function ComparisonRowActions({
  row,
  onRowUpdated,
}: {
  row: ComparisonRow;
  onRowUpdated: (subscriptionId: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [packageLoading, setPackageLoading] = useState(false);

  const syncSubscription = useAction(api.payment.adminSyncStripeSubscriptionById);
  const setInternalPackagePlan = useMutation(api.subscriptionsAdmin.setInternalPackagePlan);
  const packagePlans = useQuery(
    api.subscriptionsAdmin.listPackagePlansForAssignment,
    packageDialogOpen ? {} : "skip",
  );

  const handleSync = async () => {
    setLoading(true);
    try {
      const result = await syncSubscription({
        subscriptionId: row.stripeSubscriptionId,
      });
      if (result.success) {
        toast.success(result.message);
        await onRowUpdated(row.stripeSubscriptionId);
        if (result.needsPackageAssignment && row.localSubscriptionDocId) {
          setPackageDialogOpen(true);
        }
      } else {
        toast.error(result.message);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to sync subscription";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignPackage = async () => {
    if (!row.localSubscriptionDocId || !selectedPlanId) {
      return;
    }
    setPackageLoading(true);
    try {
      const result = await setInternalPackagePlan({
        subscriptionDocId: row.localSubscriptionDocId,
        planId: selectedPlanId as Id<"subscriptionPlans">,
      });
      toast.success(result.message);
      setPackageDialogOpen(false);
      await onRowUpdated(row.stripeSubscriptionId);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to assign package";
      toast.error(message);
    } finally {
      setPackageLoading(false);
    }
  };

  const userId = row.localUserId ?? row.mappedUserId;
  const canAssignPackage =
    row.localSubscriptionDocId != null &&
    (row.needsPackageAssignment ||
      (!row.stripePriceLinkedToPlan &&
        row.localStripePriceId != null &&
        row.localStripePriceId === row.stripePriceId));

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        {row.syncNeeded && row.canSync && (
          <Button variant="outline" size="sm" disabled={loading} onClick={handleSync}>
            {loading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Sync from Stripe
          </Button>
        )}
        {row.syncNeeded && !row.canSync && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-destructive cursor-help">Cannot sync</span>
            </TooltipTrigger>
            <TooltipContent>
              Link the Stripe customer to a Convex user before syncing.
            </TooltipContent>
          </Tooltip>
        )}
        {canAssignPackage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedPlanId(row.localPlanId ?? "");
              setPackageDialogOpen(true);
            }}
          >
            <Package className="mr-1.5 h-3.5 w-3.5" />
            {row.localPlanId ? "Change package" : "Assign package"}
          </Button>
        )}
        {userId && (
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/users/${userId}/info`}>View user</Link>
          </Button>
        )}
      </div>

      <Dialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign internal package</DialogTitle>
            <DialogDescription>
              Stripe billing stays on{" "}
              <code className="text-xs">{row.stripePriceId ?? "this price"}</code>. Choose the
              package that should control course access internally.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Package plan</Label>
            {packagePlans === undefined ? (
              <p className="text-sm text-muted-foreground">Loading plans…</p>
            ) : packagePlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No package plans available.</p>
            ) : (
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a package" />
                </SelectTrigger>
                <SelectContent>
                  {packagePlans.map((plan) => (
                    <SelectItem key={plan._id} value={plan._id}>
                      {plan.name} — {formatPrice(plan.priceAmount, plan.priceCurrency)} /{" "}
                      {plan.billingInterval}
                      {plan.isHidden ? " (hidden)" : ""}
                      {!plan.isActive ? " (inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPackageDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssignPackage}
              disabled={packageLoading || !selectedPlanId || packagePlans?.length === 0}
            >
              {packageLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const StripeSubscriptionSync = () => {
  const persistedState = useMemo(() => readPersistedSyncPageState(), []);
  const rowRefreshCountRef = useRef(0);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    persistedState?.statusFilter ?? "all",
  );
  const [viewFilter, setViewFilter] = useState<ViewFilter>(
    persistedState?.viewFilter ?? "all",
  );
  const [rows, setRows] = useState<ComparisonRow[]>(persistedState?.rows ?? []);
  const [hasMore, setHasMore] = useState(persistedState?.hasMore ?? false);
  const [nextCursor, setNextCursor] = useState<string | null>(
    persistedState?.nextCursor ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(persistedState?.loadedOnce ?? false);
  const [refreshingRowIds, setRefreshingRowIds] = useState<Set<string>>(new Set());

  const listComparison = useAction(api.subscriptionsAdminStripe.listStripeSubscriptionComparison);
  const getComparisonRow = useAction(api.subscriptionsAdminStripe.getStripeSubscriptionComparisonRow);

  const fetchPage = useCallback(
    async (options: { append: boolean; startingAfter?: string | null }) => {
      const isAppend = options.append;
      if (!isAppend && rowRefreshCountRef.current > 0) {
        return;
      }
      if (isAppend) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await listComparison({
          status: statusFilter,
          limit: 50,
          startingAfter: options.startingAfter ?? undefined,
        });

        setRows((prev) => (isAppend ? [...prev, ...result.items] : result.items));
        setHasMore(result.hasMore);
        setNextCursor(result.nextStartingAfter);
        setLoadedOnce(true);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to load Stripe subscriptions";
        toast.error(message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [listComparison, statusFilter],
  );

  useEffect(() => {
    if (!loadedOnce || rows.length === 0) {
      return;
    }
    writePersistedSyncPageState({
      rows,
      hasMore,
      nextCursor,
      statusFilter,
      viewFilter,
      loadedOnce,
    });
  }, [rows, hasMore, nextCursor, statusFilter, viewFilter, loadedOnce]);

  const handleRefresh = () => {
    clearPersistedSyncPageState();
    void fetchPage({ append: false });
  };

  const refreshRow = useCallback(
    async (subscriptionId: string) => {
      const scrollY = window.scrollY;
      rowRefreshCountRef.current += 1;
      setRefreshingRowIds((prev) => new Set(prev).add(subscriptionId));
      try {
        const updatedRow = await getComparisonRow({ subscriptionId });
        setRows((prev) =>
          prev.map((row) =>
            row.stripeSubscriptionId === subscriptionId ? updatedRow : row,
          ),
        );
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Failed to refresh subscription row";
        toast.error(message);
      } finally {
        rowRefreshCountRef.current -= 1;
        setRefreshingRowIds((prev) => {
          const next = new Set(prev);
          next.delete(subscriptionId);
          return next;
        });
        requestAnimationFrame(() => {
          window.scrollTo({ top: scrollY });
        });
      }
    },
    [getComparisonRow],
  );

  const handleLoadMore = () => {
    if (nextCursor) {
      void fetchPage({ append: true, startingAfter: nextCursor });
    }
  };

  const filteredRows = useMemo(() => {
    if (viewFilter === "needs_sync") {
      return rows.filter((row) => row.syncNeeded);
    }
    if (viewFilter === "needs_package") {
      return rows.filter((row) => row.needsPackageAssignment);
    }
    if (viewFilter === "in_sync") {
      return rows.filter((row) => row.inSync);
    }
    return rows;
  }, [rows, viewFilter]);

  const summary = useMemo(() => {
    const needsSync = rows.filter((row) => row.syncNeeded && row.canSync).length;
    const cannotSync = rows.filter((row) => row.syncNeeded && !row.canSync).length;
    const needsPackage = rows.filter((row) => row.needsPackageAssignment).length;
    const inSync = rows.filter((row) => row.inSync).length;
    return { needsSync, cannotSync, needsPackage, inSync, total: rows.length };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" asChild>
            <Link to="/stripe-subscriptions">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to subscriptions
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <GitCompareArrows className="h-8 w-8 text-primary" />
            Stripe sync check
          </h1>
          <p className="text-muted-foreground mt-1">
            Compare subscriptions in Stripe against Convex and sync individual rows when they
            diverge.
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {loadedOnce ? "Refresh" : "Load from Stripe"}
        </Button>
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Load a page from Stripe, then narrow to rows that need attention.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as StatusFilter);
              setLoadedOnce(false);
              setRows([]);
              setHasMore(false);
              setNextCursor(null);
              clearPersistedSyncPageState();
            }}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Stripe status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={viewFilter} onValueChange={(value) => setViewFilter(value as ViewFilter)}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="View" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All loaded rows</SelectItem>
              <SelectItem value="needs_sync">Needs sync only</SelectItem>
              <SelectItem value="needs_package">Needs package only</SelectItem>
              <SelectItem value="in_sync">In sync only</SelectItem>
            </SelectContent>
          </Select>
          {loadedOnce && (
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <span>{summary.total} loaded</span>
              <span>·</span>
              <span>{summary.inSync} in sync</span>
              <span>·</span>
              <span>{summary.needsSync} need sync</span>
              <span>·</span>
              <span>{summary.needsPackage} need package</span>
              {summary.cannotSync > 0 && (
                <>
                  <span>·</span>
                  <span className="text-destructive">{summary.cannotSync} blocked</span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!loadedOnce && !loading ? (
        <Card className="card-elevated">
          <CardContent className="py-12 text-center text-muted-foreground">
            Click &ldquo;Load from Stripe&rdquo; to fetch subscriptions and compare them with your
            database.
          </CardContent>
        </Card>
      ) : loading && rows.length === 0 ? (
        <Card className="card-elevated">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
            Loading from Stripe…
          </CardContent>
        </Card>
      ) : filteredRows.length === 0 ? (
        <Card className="card-elevated">
          <CardContent className="py-12 text-center text-muted-foreground">
            No rows match the current filters.
          </CardContent>
        </Card>
      ) : (
        <Card className="card-elevated">
          <CardContent className="pt-6">
            <TooltipProvider>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Match</TableHead>
                      <TableHead>Stripe</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Issues</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => {
                      const mapped = userLabel(row.mappedUserName, row.mappedUserEmail);
                      const local = userLabel(row.localUserName, row.localUserEmail);
                      const isRefreshingRow = refreshingRowIds.has(row.stripeSubscriptionId);

                      return (
                        <TableRow
                          key={row.stripeSubscriptionId}
                          className={isRefreshingRow ? "opacity-60" : undefined}
                        >
                          <TableCell>
                            <SyncStatusBadge row={row} />
                          </TableCell>
                          <TableCell className="min-w-[220px]">
                            <div className="space-y-1 text-sm">
                              <p className="font-medium capitalize">
                                {row.stripeStatus.replace("_", " ")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatPeriod(
                                  row.stripeCurrentPeriodStart,
                                  row.stripeCurrentPeriodEnd,
                                )}
                              </p>
                              <p className="font-mono text-xs text-muted-foreground">
                                {row.stripeSubscriptionId}
                              </p>
                              {row.stripePriceId && (
                                <p className="font-mono text-xs text-muted-foreground">
                                  {row.stripePriceId}
                                </p>
                              )}
                              {row.stripeCancelAtPeriodEnd && (
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                  Cancels at period end
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[220px]">
                            {row.localSubscriptionDocId ? (
                              <div className="space-y-1 text-sm">
                                <p className="font-medium capitalize">
                                  {(row.localStatus ?? "—").replace("_", " ")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatPeriod(
                                    row.localCurrentPeriodStart ?? 0,
                                    row.localCurrentPeriodEnd ?? 0,
                                  )}
                                </p>
                                {row.localPlanName && (
                                  <p className="text-xs">
                                    Package: {row.localPlanName}
                                    {!row.stripePriceLinkedToPlan ? " (override)" : ""}
                                  </p>
                                )}
                                {row.localStripePriceId && (
                                  <p className="font-mono text-xs text-muted-foreground">
                                    {row.localStripePriceId}
                                  </p>
                                )}
                                {row.legacyMigrationStatus === "migrated" && (
                                  <p className="text-xs text-amber-700 dark:text-amber-400">
                                    Legacy migration flag
                                  </p>
                                )}
                                {row.localCancelAtPeriodEnd && (
                                  <p className="text-xs text-amber-700 dark:text-amber-400">
                                    Cancels at period end
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">Not in database</span>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[180px]">
                            <div className="space-y-2 text-sm">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">
                                  Mapped from Stripe customer
                                </p>
                                <p>{mapped.title}</p>
                                {mapped.subtitle && (
                                  <p className="text-xs text-muted-foreground">{mapped.subtitle}</p>
                                )}
                                {row.stripeCustomerEmail &&
                                  row.stripeCustomerEmail !== mapped.subtitle && (
                                    <p className="text-xs text-muted-foreground">
                                      Stripe: {row.stripeCustomerEmail}
                                    </p>
                                  )}
                              </div>
                              {row.localUserId &&
                                row.mappedUserId &&
                                row.localUserId !== row.mappedUserId && (
                                  <p className="text-xs text-destructive">
                                    Local user differs from Stripe customer mapping
                                  </p>
                                )}
                              {row.localUserId && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground">
                                    Local record user
                                  </p>
                                  <p>{local.title}</p>
                                  {local.subtitle && (
                                    <p className="text-xs text-muted-foreground">{local.subtitle}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="min-w-[180px]">
                            {row.syncReasons.length === 0 &&
                            row.expectedDifferences.length === 0 ? (
                              <span className="text-sm text-muted-foreground">—</span>
                            ) : (
                              <ul className="space-y-1 text-xs text-muted-foreground">
                                {row.syncReasons.map((reason) => (
                                  <li key={reason}>{reason}</li>
                                ))}
                                {row.expectedDifferences.map((note) => (
                                  <li key={note} className="text-muted-foreground/90">
                                    {note}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <ComparisonRowActions row={row} onRowUpdated={refreshRow} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>

            {hasMore && viewFilter === "all" && (
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" disabled={loadingMore} onClick={handleLoadMore}>
                  {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Load more from Stripe
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StripeSubscriptionSync;
