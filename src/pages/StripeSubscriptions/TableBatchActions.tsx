import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
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
import type { SubscriptionRow } from "./SubscriptionRowActions";

type EligiblePrice = {
  stripePriceId: string;
  planName: string;
  priceAmount: number;
  priceCurrency: string;
  billingInterval: "month" | "year";
  isCurrent: boolean;
  isArchived: boolean;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    typeof (error as { data?: { message?: string } }).data?.message === "string"
  ) {
    return (error as { data: { message: string } }).data.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function TableBatchActions({ rows }: { rows: SubscriptionRow[] }) {
  const [autoRenewLoading, setAutoRenewLoading] = useState(false);
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [selectedPriceId, setSelectedPriceId] = useState("");
  const [priceLoading, setPriceLoading] = useState(false);

  const setAutoRenewal = useAction(api.subscriptionsAdminStripe.setAutoRenewal);
  const setRenewalPrice = useAction(api.subscriptionsAdminStripe.setRenewalPrice);

  const manageableRows = useMemo(
    () => rows.filter((row) => row.canManageStripe),
    [rows],
  );

  const rowsNeedingAutoRenew = useMemo(
    () => manageableRows.filter((row) => !row.autoRenewEnabled),
    [manageableRows],
  );

  const sampleRow = manageableRows[0];

  const eligiblePrices = useQuery(
    api.subscriptionsAdmin.getEligibleRenewalPrices,
    priceDialogOpen && sampleRow
      ? { subscriptionDocId: sampleRow.subscriptionDocId }
      : "skip",
  ) as EligiblePrice[] | undefined;

  const selectablePrices =
    eligiblePrices?.filter((price) => !price.isCurrent) ?? [];

  const handleEnableAutoRenewAll = async () => {
    if (rowsNeedingAutoRenew.length === 0) {
      return;
    }

    setAutoRenewLoading(true);
    let succeeded = 0;
    let failed = 0;

    for (const row of rowsNeedingAutoRenew) {
      try {
        await setAutoRenewal({
          subscriptionDocId: row.subscriptionDocId,
          autoRenew: true,
        });
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }

    if (failed === 0) {
      toast.success(
        `Auto-renewal enabled for ${succeeded} subscription${succeeded === 1 ? "" : "s"}.`,
      );
    } else if (succeeded === 0) {
      toast.error(`Failed to enable auto-renewal for ${failed} subscription${failed === 1 ? "" : "s"}.`);
    } else {
      toast.warning(
        `Auto-renewal enabled for ${succeeded} subscription${succeeded === 1 ? "" : "s"}, ${failed} failed.`,
      );
    }

    setAutoRenewLoading(false);
  };

  const handleOpenPriceDialog = () => {
    setSelectedPriceId("");
    setPriceDialogOpen(true);
  };

  const handleChangeRenewalPriceAll = async () => {
    if (!selectedPriceId || manageableRows.length === 0) {
      return;
    }

    const targets = manageableRows.filter(
      (row) =>
        selectedPriceId !== row.stripePriceId &&
        selectedPriceId !== row.renewalStripePriceId,
    );

    if (targets.length === 0) {
      toast.info("All subscriptions in this table are already on the selected price.");
      return;
    }

    setPriceLoading(true);
    let succeeded = 0;
    let failed = 0;

    for (const row of targets) {
      try {
        await setRenewalPrice({
          subscriptionDocId: row.subscriptionDocId,
          stripePriceId: selectedPriceId,
        });
        succeeded += 1;
      } catch (error: unknown) {
        failed += 1;
        if (failed === 1 && targets.length === 1) {
          toast.error(getErrorMessage(error, "Failed to update renewal price"));
        }
      }
    }

    if (targets.length > 1) {
      if (failed === 0) {
        toast.success(
          `Renewal price updated for ${succeeded} subscription${succeeded === 1 ? "" : "s"}.`,
        );
      } else if (succeeded === 0) {
        toast.error(
          `Failed to update renewal price for ${failed} subscription${failed === 1 ? "" : "s"}.`,
        );
      } else {
        toast.warning(
          `Renewal price updated for ${succeeded} subscription${succeeded === 1 ? "" : "s"}, ${failed} failed.`,
        );
      }
    } else if (succeeded === 1) {
      toast.success("Renewal price updated.");
    }

    setPriceLoading(false);
    if (failed === 0) {
      setPriceDialogOpen(false);
    }
  };

  if (manageableRows.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={autoRenewLoading || rowsNeedingAutoRenew.length === 0}
          onClick={handleEnableAutoRenewAll}
        >
          {autoRenewLoading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Enable auto-renew for all
          {rowsNeedingAutoRenew.length > 0 && (
            <span className="ml-1.5 text-muted-foreground">({rowsNeedingAutoRenew.length})</span>
          )}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleOpenPriceDialog}>
          Change renewal price for all
        </Button>
      </div>

      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change renewal price for all</DialogTitle>
            <DialogDescription>
              Applies to {manageableRows.length} subscription
              {manageableRows.length === 1 ? "" : "s"} in this table on the next billing cycle with
              no proration charge today.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="batch-renewal-price">Eligible price</Label>
            {eligiblePrices === undefined ? (
              <p className="text-sm text-muted-foreground">Loading prices…</p>
            ) : selectablePrices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alternate prices available.</p>
            ) : (
              <Select value={selectedPriceId} onValueChange={setSelectedPriceId}>
                <SelectTrigger id="batch-renewal-price">
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
              onClick={handleChangeRenewalPriceAll}
              disabled={
                priceLoading ||
                !selectedPriceId ||
                selectablePrices.length === 0 ||
                manageableRows.every(
                  (row) =>
                    selectedPriceId === row.stripePriceId ||
                    selectedPriceId === row.renewalStripePriceId,
                )
              }
            >
              {priceLoading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Apply to all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
