import { useState } from "react";
import { format } from "date-fns";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Package,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { formatPrice } from "@/pages/Payments/utils";

type StripeComparisonRow = {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripeStatus: string;
  stripePriceId: string | null;
  stripeCurrentPeriodStart: number;
  stripeCurrentPeriodEnd: number;
  stripeCancelAtPeriodEnd: boolean;
  localSubscriptionDocId: Id<"subscriptions"> | null;
  localStatus: string | null;
  localCurrentPeriodStart: number | null;
  localCurrentPeriodEnd: number | null;
  localCancelAtPeriodEnd: boolean | null;
  localStripePriceId: string | null;
  localRenewalStripePriceId: string | null;
  localPlanId: Id<"subscriptionPlans"> | null;
  localPlanName: string | null;
  stripePriceLinkedToPlan: boolean;
  needsPackageAssignment: boolean;
  inSync: boolean;
  syncNeeded: boolean;
  canSync: boolean;
  syncReasons: string[];
  expectedDifferences: string[];
};

type StripePriceDisplay = {
  stripePriceId: string;
  planName: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  interval: string | null;
};

type UserSubscription = {
  subscriptionDocId: Id<"subscriptions">;
  subscriptionId: string;
  status: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  isAdminGranted: boolean;
  isStripeBacked: boolean;
  canManageStripe: boolean;
  planId: Id<"subscriptionPlans"> | null | undefined;
  planName: string | null | undefined;
  stripePriceId: string | null;
  renewalStripePriceId: string | null;
  hasScheduledRenewalPrice: boolean;
  renewalPlanName: string | null;
  renewalPriceAmount: number | null;
  renewalPriceCurrency: string | null;
};

function formatPeriod(startMs: number, endMs: number) {
  if (startMs <= 0 || endMs <= 0) {
    return "—";
  }
  return `${format(new Date(startMs), "MMM d, yyyy")} – ${format(new Date(endMs), "MMM d, yyyy")}`;
}

function formatStripePrice(display: StripePriceDisplay | undefined, priceId: string | null) {
  if (display?.planName && display.priceAmount != null && display.priceCurrency) {
    const interval = display.interval ? ` / ${display.interval}` : "";
    return `${display.planName} · ${formatPrice(display.priceAmount, display.priceCurrency)}${interval}`;
  }
  return priceId ?? "—";
}

function SyncStatusBadge({ row }: { row: StripeComparisonRow }) {
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

  if (row.inSync) {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        In sync
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1">
      <CheckCircle2 className="h-3 w-3" />
      OK
    </Badge>
  );
}

type Props = {
  userId: Id<"users">;
  stripeCustomerId: string | null | undefined;
  subscription: UserSubscription | null;
};

export function UserStripeBillingSection({ userId, stripeCustomerId, subscription }: Props) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [comparison, setComparison] = useState<StripeComparisonRow | null>(null);
  const [canManageStripe, setCanManageStripe] = useState(false);
  const [stripePriceDisplay, setStripePriceDisplay] = useState<StripePriceDisplay | undefined>();
  const [renewalPriceDisplay, setRenewalPriceDisplay] = useState<StripePriceDisplay | undefined>();
  const [packageDialogOpen, setPackageDialogOpen] = useState(false);
  const [renewalDialogOpen, setRenewalDialogOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedRenewalPriceId, setSelectedRenewalPriceId] = useState("");
  const [packageLoading, setPackageLoading] = useState(false);
  const [renewalLoading, setRenewalLoading] = useState(false);

  const fetchStripeDetails = useAction(api.subscriptionsAdminStripe.fetchUserStripeSubscriptionDetails);
  const syncFromStripe = useAction(api.payment.adminSyncStripeSubscriptionById);
  const syncUserSubscription = useAction(api.payment.adminSyncUserSubscriptionFromStripe);
  const setInternalPackagePlan = useMutation(api.subscriptionsAdmin.setInternalPackagePlan);
  const setRenewalPrice = useAction(api.subscriptionsAdminStripe.setRenewalPrice);

  const subscriptionDocId =
    comparison?.localSubscriptionDocId ?? subscription?.subscriptionDocId ?? null;

  const packagePlans = useQuery(
    api.subscriptionsAdmin.listPackagePlansForAssignment,
    packageDialogOpen ? {} : "skip",
  );

  const eligiblePrices = useQuery(
    api.subscriptionsAdmin.getEligibleRenewalPrices,
    renewalDialogOpen && subscriptionDocId ? { subscriptionDocId } : "skip",
  );

  const handleLoadFromStripe = async () => {
    setLoading(true);
    try {
      const result = await fetchStripeDetails({ userId });
      if (!result.success || !result.comparison) {
        toast.error(result.message);
        setComparison(null);
        return;
      }
      setComparison(result.comparison as StripeComparisonRow);
      setCanManageStripe(result.canManageStripe ?? false);
      setStripePriceDisplay(result.stripePriceDisplay);
      setRenewalPriceDisplay(result.renewalPriceDisplay);
      toast.success(result.message);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to load Stripe data";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const refreshAfterChange = async () => {
    const result = await fetchStripeDetails({ userId });
    if (result.success && result.comparison) {
      setComparison(result.comparison as StripeComparisonRow);
      setCanManageStripe(result.canManageStripe ?? false);
      setStripePriceDisplay(result.stripePriceDisplay);
      setRenewalPriceDisplay(result.renewalPriceDisplay);
    }
  };

  const handleSync = async () => {
    if (!comparison) {
      return;
    }
    setSyncing(true);
    try {
      const result = await syncFromStripe({
        subscriptionId: comparison.stripeSubscriptionId,
      });
      if (result.success) {
        toast.success(result.message);
        await refreshAfterChange();
        if (result.needsPackageAssignment) {
          setPackageDialogOpen(true);
        }
      } else {
        toast.error(result.message);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to sync from Stripe";
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  };

  const handleQuickRefresh = async () => {
    setSyncing(true);
    try {
      const result = await syncUserSubscription({ userId });
      if (result.success) {
        toast.success(result.message);
        await refreshAfterChange();
      } else {
        toast.error(result.message);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to refresh subscription";
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  };

  const handleAssignPackage = async () => {
    if (!subscriptionDocId || !selectedPlanId) {
      return;
    }
    setPackageLoading(true);
    try {
      const result = await setInternalPackagePlan({
        subscriptionDocId,
        planId: selectedPlanId as Id<"subscriptionPlans">,
      });
      toast.success(result.message);
      setPackageDialogOpen(false);
      await refreshAfterChange();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to assign package";
      toast.error(message);
    } finally {
      setPackageLoading(false);
    }
  };

  const handleChangeRenewalPrice = async () => {
    if (!subscriptionDocId || !selectedRenewalPriceId) {
      return;
    }
    setRenewalLoading(true);
    try {
      const result = await setRenewalPrice({
        subscriptionDocId,
        stripePriceId: selectedRenewalPriceId,
      });
      toast.success(result.message);
      setRenewalDialogOpen(false);
      await refreshAfterChange();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to update next billing price";
      toast.error(message);
    } finally {
      setRenewalLoading(false);
    }
  };

  if (!stripeCustomerId) {
    return null;
  }

  const activeRow = comparison;
  const canAssignPackage =
    subscriptionDocId != null &&
    activeRow != null &&
    (activeRow.needsPackageAssignment ||
      (!activeRow.stripePriceLinkedToPlan &&
        activeRow.localStripePriceId != null &&
        activeRow.localStripePriceId === activeRow.stripePriceId));

  const canChangeRenewal =
    (canManageStripe || subscription?.canManageStripe) && subscriptionDocId != null;

  const selectableRenewalPrices =
    eligiblePrices?.filter((price) => !price.isCurrent) ?? [];

  const nextBillingLabel = (() => {
    if (renewalPriceDisplay) {
      return formatStripePrice(renewalPriceDisplay, activeRow?.localRenewalStripePriceId ?? null);
    }
    if (subscription?.hasScheduledRenewalPrice && subscription.renewalPlanName) {
      const price =
        subscription.renewalPriceAmount != null && subscription.renewalPriceCurrency
          ? formatPrice(subscription.renewalPriceAmount, subscription.renewalPriceCurrency)
          : null;
      return price ? `${subscription.renewalPlanName} · ${price}` : subscription.renewalPlanName;
    }
    return null;
  })();

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Stripe billing
            </CardTitle>
            <CardDescription>
              Load live Stripe data, sync local records, and manage package or next billing price.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleLoadFromStripe} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load from Stripe
            </Button>
            {subscription?.isStripeBacked && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleQuickRefresh}
                disabled={syncing}
              >
                {syncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sync to database
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <div className="text-muted-foreground">Stripe customer</div>
              <p className="font-mono text-xs break-all">{stripeCustomerId}</p>
            </div>
            {subscription?.hasScheduledRenewalPrice && nextBillingLabel && (
              <div className="space-y-1">
                <div className="text-muted-foreground">Next billing (scheduled)</div>
                <p className="font-medium">{nextBillingLabel}</p>
                {subscription.currentPeriodEnd > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Applies after {format(new Date(subscription.currentPeriodEnd), "PPP")}
                  </p>
                )}
              </div>
            )}
          </div>

          {!activeRow ? (
            <p className="text-sm text-muted-foreground">
              Click &ldquo;Load from Stripe&rdquo; to fetch subscription status, billing period,
              and price from Stripe.
            </p>
          ) : (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SyncStatusBadge row={activeRow} />
                <div className="flex flex-wrap gap-2">
                  {activeRow.syncNeeded && activeRow.canSync && (
                    <Button variant="outline" size="sm" disabled={syncing} onClick={handleSync}>
                      {syncing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      Sync from Stripe
                    </Button>
                  )}
                  {canAssignPackage && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedPlanId(activeRow.localPlanId ?? "");
                        setPackageDialogOpen(true);
                      }}
                    >
                      <Package className="mr-1.5 h-3.5 w-3.5" />
                      {activeRow.localPlanId ? "Change package" : "Assign package"}
                    </Button>
                  )}
                  {canChangeRenewal && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRenewalPriceId(
                          activeRow.localRenewalStripePriceId ??
                            activeRow.stripePriceId ??
                            "",
                        );
                        setRenewalDialogOpen(true);
                      }}
                    >
                      Change next billing
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-3">
                  <p className="font-medium text-muted-foreground uppercase text-xs tracking-wide">
                    Stripe
                  </p>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Subscription</div>
                    <p className="font-mono text-xs break-all">{activeRow.stripeSubscriptionId}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Status</div>
                    <p className="capitalize">{activeRow.stripeStatus.replace("_", " ")}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Billing period</div>
                    <p>
                      {formatPeriod(
                        activeRow.stripeCurrentPeriodStart,
                        activeRow.stripeCurrentPeriodEnd,
                      )}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Stripe price</div>
                    <p>{formatStripePrice(stripePriceDisplay, activeRow.stripePriceId)}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="font-medium text-muted-foreground uppercase text-xs tracking-wide">
                    Local database
                  </p>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Status</div>
                    <p className="capitalize">
                      {activeRow.localStatus?.replace("_", " ") ?? "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Billing period</div>
                    <p>
                      {activeRow.localCurrentPeriodStart != null &&
                      activeRow.localCurrentPeriodEnd != null
                        ? formatPeriod(
                            activeRow.localCurrentPeriodStart,
                            activeRow.localCurrentPeriodEnd,
                          )
                        : "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Internal package</div>
                    <p>{activeRow.localPlanName ?? "—"}</p>
                  </div>
                  {nextBillingLabel && (
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Next billing</div>
                      <p>{nextBillingLabel}</p>
                    </div>
                  )}
                </div>
              </div>

              {activeRow.syncReasons.length > 0 && (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-200 mb-1">
                    Differences
                  </p>
                  <ul className="list-disc list-inside text-amber-800 dark:text-amber-300 space-y-0.5">
                    {activeRow.syncReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activeRow.expectedDifferences.length > 0 && (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                  <p className="font-medium mb-1">Expected overrides</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {activeRow.expectedDifferences.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={packageDialogOpen} onOpenChange={setPackageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {activeRow?.localPlanId ? "Change internal package" : "Assign internal package"}
            </DialogTitle>
            <DialogDescription>
              Stripe billing stays on{" "}
              <code className="text-xs">{activeRow?.stripePriceId ?? "this price"}</code>. Choose
              the package that controls course access internally.
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

      <Dialog open={renewalDialogOpen} onOpenChange={setRenewalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change next billing price</DialogTitle>
            <DialogDescription>
              Updates Stripe for the next billing cycle with no proration charge today. Current
              access continues until the period ends.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Eligible price</Label>
            {eligiblePrices === undefined ? (
              <p className="text-sm text-muted-foreground">Loading prices…</p>
            ) : selectableRenewalPrices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alternate prices available.</p>
            ) : (
              <Select value={selectedRenewalPriceId} onValueChange={setSelectedRenewalPriceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a price" />
                </SelectTrigger>
                <SelectContent>
                  {eligiblePrices.map((price) => (
                    <SelectItem
                      key={price.stripePriceId}
                      value={price.stripePriceId}
                      disabled={price.isCurrent}
                    >
                      {price.planName} — {formatPrice(price.priceAmount, price.priceCurrency)} /{" "}
                      {price.billingInterval}
                      {price.isCurrent ? " (current)" : ""}
                      {price.isArchived ? " (archived)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenewalDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleChangeRenewalPrice}
              disabled={
                renewalLoading ||
                !selectedRenewalPriceId ||
                selectableRenewalPrices.length === 0
              }
            >
              {renewalLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save next billing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
