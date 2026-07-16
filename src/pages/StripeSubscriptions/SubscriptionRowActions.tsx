import { useState } from "react";
import { Link } from "react-router-dom";
import { useAction, useQuery } from "convex/react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "unpaid"
  | "incomplete"
  | "trialing";

export type SubscriptionRow = {
  subscriptionDocId: Id<"subscriptions">;
  subscriptionId: string;
  userId: Id<"users">;
  userName: string | null;
  userEmail: string | null;
  status: SubscriptionStatus;
  planId: Id<"subscriptionPlans"> | null;
  stripePriceId: string | null;
  planName: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  renewalPlanName: string | null;
  renewalPriceAmount: number | null;
  renewalPriceCurrency: string | null;
  renewalStripePriceId: string | null;
  hasScheduledRenewalPrice: boolean;
  interval: string | null;
  intervalCount: number | null;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  autoRenewEnabled: boolean;
  canManageStripe: boolean;
  isAdminGranted: boolean;
  isStripeBacked: boolean;
  updatedAt: number;
};

type EligiblePrice = {
  stripePriceId: string;
  planId?: Id<"subscriptionPlans">;
  planName: string;
  priceAmount: number;
  priceCurrency: string;
  billingInterval: "month" | "year";
  isCurrent: boolean;
  isArchived: boolean;
};

function AutoRenewBadge({ row }: { row: SubscriptionRow }) {
  if (row.isAdminGranted || !row.isStripeBacked) {
    return <span className="text-sm text-muted-foreground">N/A</span>;
  }

  if (row.status === "canceled") {
    return (
      <Badge variant="secondary" className="text-xs">
        Ended
      </Badge>
    );
  }

  if (row.autoRenewEnabled) {
    return (
      <Badge variant="default" className="text-xs">
        On
      </Badge>
    );
  }

  if (row.cancelAtPeriodEnd) {
    return (
      <Badge variant="secondary" className="text-xs">
        Off
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs capitalize">
      {row.status.replace("_", " ")}
    </Badge>
  );
}

export function SubscriptionRowActions({ row }: { row: SubscriptionRow }) {
  const [autoRenewLoading, setAutoRenewLoading] = useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [selectedPriceId, setSelectedPriceId] = useState("");
  const [priceLoading, setPriceLoading] = useState(false);

  const setAutoRenewal = useAction(api.subscriptionsAdminStripe.setAutoRenewal);
  const setRenewalPrice = useAction(api.subscriptionsAdminStripe.setRenewalPrice);

  const eligiblePrices = useQuery(
    api.subscriptionsAdmin.getEligibleRenewalPrices,
    priceDialogOpen ? { subscriptionDocId: row.subscriptionDocId } : "skip",
  ) as EligiblePrice[] | undefined;

  const handleToggleAutoRenew = async () => {
    if (!row.canManageStripe) {
      return;
    }

    setAutoRenewLoading(true);
    try {
      const result = await setAutoRenewal({
        subscriptionDocId: row.subscriptionDocId,
        autoRenew: !row.autoRenewEnabled,
      });
      toast.success(result.message);
    } catch (error: unknown) {
      const message =
        error &&
        typeof error === "object" &&
        "data" in error &&
        typeof (error as { data?: { message?: string } }).data?.message === "string"
          ? (error as { data: { message: string } }).data.message
          : error instanceof Error
            ? error.message
            : "Failed to update auto-renewal";
      toast.error(message);
    } finally {
      setAutoRenewLoading(false);
    }
  };

  const handleOpenPriceDialog = () => {
    setSelectedPriceId(row.stripePriceId ?? "");
    setPriceDialogOpen(true);
  };

  const handleChangeRenewalPrice = async () => {
    if (!selectedPriceId || selectedPriceId === row.stripePriceId) {
      return;
    }

    setPriceLoading(true);
    try {
      const result = await setRenewalPrice({
        subscriptionDocId: row.subscriptionDocId,
        stripePriceId: selectedPriceId,
      });
      toast.success(result.message);
      setPriceDialogOpen(false);
    } catch (error: unknown) {
      const message =
        error &&
        typeof error === "object" &&
        "data" in error &&
        typeof (error as { data?: { message?: string } }).data?.message === "string"
          ? (error as { data: { message: string } }).data.message
          : error instanceof Error
            ? error.message
            : "Failed to update renewal price";
      toast.error(message);
    } finally {
      setPriceLoading(false);
    }
  };

  const selectablePrices =
    eligiblePrices?.filter((price) => !price.isCurrent) ?? [];

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        {row.canManageStripe && (
          <Button
            variant="outline"
            size="sm"
            disabled={autoRenewLoading}
            onClick={handleToggleAutoRenew}
          >
            {autoRenewLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {row.autoRenewEnabled ? "Disable auto-renew" : "Enable auto-renew"}
          </Button>
        )}
        {row.canManageStripe && (
          <Button variant="outline" size="sm" onClick={handleOpenPriceDialog}>
            Change renewal price
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link to={`/users/${row.userId}/info`}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            User
          </Link>
        </Button>
      </div>

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change renewal price</DialogTitle>
            <DialogDescription>
              {row.userName ?? row.userEmail ?? "User"} — applies on the next billing cycle with no
              proration charge today.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor={`renewal-price-${row.subscriptionDocId}`}>Eligible price</Label>
            {eligiblePrices === undefined ? (
              <p className="text-sm text-muted-foreground">Loading prices…</p>
            ) : selectablePrices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alternate prices available.</p>
            ) : (
              <Select value={selectedPriceId} onValueChange={setSelectedPriceId}>
                <SelectTrigger id={`renewal-price-${row.subscriptionDocId}`}>
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
            <Button variant="ghost" onClick={() => setPriceDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleChangeRenewalPrice}
              disabled={
                priceLoading ||
                !selectedPriceId ||
                selectedPriceId === row.stripePriceId ||
                selectablePrices.length === 0
              }
            >
              {priceLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save renewal price
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AutoRenewCell({ row }: { row: SubscriptionRow }) {
  return (
    <div className="space-y-1">
      <AutoRenewBadge row={row} />
      {row.cancelAtPeriodEnd && row.canManageStripe && (
        <p className="text-xs text-muted-foreground">Cancels at period end</p>
      )}
    </div>
  );
}
