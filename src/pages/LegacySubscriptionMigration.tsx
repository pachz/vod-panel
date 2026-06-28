import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { useAction, useQuery } from "convex/react";
import { ArrowRightLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

type StripeSegmentKey = "stripe_monthly" | "stripe_yearly" | "stripe_unknown";

type MigrationRow = {
  userId: Id<"users">;
  userName: string;
  userEmail: string;
  subscriptionDocId: Id<"subscriptions">;
  subscriptionId: string;
  status: string;
  interval: string | null;
  currentPeriodEnd: number;
  assignedPlanName: string | null;
  legacyMigrationStatus: "migrated" | null;
};

type PlanOption = {
  _id: Id<"subscriptionPlans">;
  name: string;
  billingInterval: "month" | "year";
  isHidden: boolean;
  isActive: boolean;
};

type RowProgress = "idle" | "queued" | "running" | "done" | "failed";

const STRIPE_SEGMENT_META: Record<
  StripeSegmentKey,
  { title: string; description: string; preferredInterval?: "month" | "year" }
> = {
  stripe_monthly: {
    title: "Stripe monthly",
    description:
      "Legacy all-access subscribers billed monthly on Stripe. Migration cancels auto-renew on Stripe and maps each user to a monthly package plan until period end.",
    preferredInterval: "month",
  },
  stripe_yearly: {
    title: "Stripe yearly",
    description:
      "Legacy all-access subscribers billed yearly on Stripe. Migration cancels auto-renew on Stripe and maps each user to a yearly package plan until period end.",
    preferredInterval: "year",
  },
  stripe_unknown: {
    title: "Stripe (unclassified)",
    description:
      "Active Stripe subscriptions that could not be matched to legacy monthly/yearly prices. Review before migrating.",
  },
};

function planLabel(plan: PlanOption) {
  const flags = [
    plan.isHidden ? "hidden" : null,
    !plan.isActive ? "inactive" : null,
  ]
    .filter(Boolean)
    .join(", ");
  const interval = plan.billingInterval === "month" ? "monthly" : "yearly";
  return flags ? `${plan.name} (${interval}, ${flags})` : `${plan.name} (${interval})`;
}

function MigrationStatusBadge({
  row,
  progress,
  errorMessage,
}: {
  row: MigrationRow;
  progress: RowProgress;
  errorMessage?: string;
}) {
  if (row.legacyMigrationStatus === "migrated" || progress === "done") {
    return (
      <Badge variant="default" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Migrated
      </Badge>
    );
  }

  if (progress === "running") {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Updating Stripe…
      </Badge>
    );
  }

  if (progress === "queued") {
    return <Badge variant="secondary">Queued</Badge>;
  }

  if (progress === "failed") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="gap-1 cursor-help">
              <XCircle className="h-3 w-3" />
              Failed
            </Badge>
          </TooltipTrigger>
          {errorMessage ? (
            <TooltipContent className="max-w-xs">{errorMessage}</TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>
    );
  }

  return <Badge variant="outline">Not migrated</Badge>;
}

function StripeSegmentCard({
  segmentKey,
  rows,
  plans,
  rowProgress,
  rowErrors,
  onMigrate,
}: {
  segmentKey: StripeSegmentKey;
  rows: MigrationRow[];
  plans: PlanOption[];
  rowProgress: Record<string, RowProgress>;
  rowErrors: Record<string, string>;
  onMigrate: (segment: StripeSegmentKey, planId: Id<"subscriptionPlans">, rows: MigrationRow[]) => Promise<void>;
}) {
  const meta = STRIPE_SEGMENT_META[segmentKey];
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);

  const filteredPlans = useMemo(() => {
    if (!meta.preferredInterval) {
      return plans;
    }
    const matching = plans.filter((p) => p.billingInterval === meta.preferredInterval);
    return matching.length > 0 ? matching : plans;
  }, [meta.preferredInterval, plans]);

  const pendingCount = rows.filter(
    (row) =>
      row.legacyMigrationStatus !== "migrated" &&
      (rowProgress[row.userId] ?? "idle") !== "done" &&
      (rowProgress[row.userId] ?? "idle") !== "running" &&
      (rowProgress[row.userId] ?? "idle") !== "queued",
  ).length;

  const handleMigrate = async () => {
    if (!selectedPlanId) {
      toast.error("Select a target plan first");
      return;
    }
    setIsRunning(true);
    try {
      await onMigrate(segmentKey, selectedPlanId as Id<"subscriptionPlans">, rows);
    } finally {
      setIsRunning(false);
    }
  };

  const isSegmentBusy = rows.some((row) => {
    const p = rowProgress[row.userId] ?? "idle";
    return p === "queued" || p === "running";
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              {meta.title}
              <Badge variant="secondary">{rows.length}</Badge>
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl">{meta.description}</CardDescription>
          </div>
          <div className="flex min-w-[280px] flex-col gap-2 sm:min-w-[320px]">
            <Label htmlFor={`plan-${segmentKey}`}>Target package plan</Label>
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId} disabled={isRunning}>
              <SelectTrigger id={`plan-${segmentKey}`}>
                <SelectValue placeholder="Select plan (includes hidden)" />
              </SelectTrigger>
              <SelectContent>
                {filteredPlans.map((plan) => (
                  <SelectItem key={plan._id} value={plan._id}>
                    {planLabel(plan)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="cta"
              disabled={isRunning || isSegmentBusy || pendingCount === 0 || !selectedPlanId}
              onClick={handleMigrate}
            >
              {(isRunning || isSegmentBusy) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Migrate {pendingCount} subscriber{pendingCount === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users in this segment.</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Migration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Period end</TableHead>
                  <TableHead>Subscription</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>
                      <Link
                        to={`/users/${row.userId}/info`}
                        className="font-medium hover:underline"
                      >
                        {row.userName || "—"}
                      </Link>
                      <div className="text-xs text-muted-foreground">{row.userEmail || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <MigrationStatusBadge
                        row={row}
                        progress={rowProgress[row.userId] ?? "idle"}
                        errorMessage={rowErrors[row.userId]}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.interval ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(row.currentPeriodEnd), "PPP")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.subscriptionId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminManualListCard({ rows }: { rows: MigrationRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Admin manual
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
        <CardDescription className="max-w-2xl">
          Active admin-granted legacy subscriptions (no Stripe). Listed for reference only — use
          the user profile to grant or adjust package plans manually.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active admin-granted subscriptions.</p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Period end</TableHead>
                  <TableHead>Subscription</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>
                      <Link
                        to={`/users/${row.userId}/info`}
                        className="font-medium hover:underline"
                      >
                        {row.userName || "—"}
                      </Link>
                      <div className="text-xs text-muted-foreground">{row.userEmail || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(row.currentPeriodEnd), "PPP")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.subscriptionId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LegacySubscriptionMigration() {
  const overview = useQuery(api.legacySubscriptionMigration.getLegacyMigrationOverview);
  const migrateOne = useAction(
    api.legacySubscriptionMigrationStripe.migrateLegacyStripeSubscription,
  );

  const [rowProgress, setRowProgress] = useState<Record<string, RowProgress>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const handleMigrateStripe = async (
    _segment: StripeSegmentKey,
    planId: Id<"subscriptionPlans">,
    rows: MigrationRow[],
  ) => {
    const toProcess = rows.filter((row) => row.legacyMigrationStatus !== "migrated");

    setRowProgress((prev) => {
      const next = { ...prev };
      for (const row of toProcess) {
        next[row.userId] = "queued";
      }
      return next;
    });

    let succeeded = 0;
    let failed = 0;

    for (const row of toProcess) {
      setRowProgress((prev) => ({ ...prev, [row.userId]: "running" }));

      const result = await migrateOne({
        userId: row.userId,
        subscriptionDocId: row.subscriptionDocId,
        targetPlanId: planId,
      });

      if (result.success) {
        succeeded += 1;
        setRowProgress((prev) => ({ ...prev, [row.userId]: "done" }));
        setRowErrors((prev) => {
          const next = { ...prev };
          delete next[row.userId];
          return next;
        });
      } else {
        failed += 1;
        setRowProgress((prev) => ({ ...prev, [row.userId]: "failed" }));
        setRowErrors((prev) => ({ ...prev, [row.userId]: result.message }));
      }
    }

    if (failed > 0) {
      toast.error(`Finished: ${succeeded} migrated, ${failed} failed`);
    } else if (succeeded > 0) {
      toast.success(`Migrated ${succeeded} subscriber(s)`);
    }
  };

  if (overview === undefined) {
    return (
      <div className="flex min-h-[320px] items-center justify-center text-muted-foreground">
        Loading migration overview…
      </div>
    );
  }

  const migrated = overview.segments.already_migrated;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <ArrowRightLeft className="h-8 w-8" />
          Legacy subscription migration
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Move active legacy Stripe subscribers onto package plans. Each user is updated one at a
          time — Stripe cancel-at-period-end, then local plan assignment. Progress is shown per row.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ["stripe_monthly", overview.segments.stripe_monthly.length],
            ["stripe_yearly", overview.segments.stripe_yearly.length],
            ["admin_manual", overview.segments.admin_manual.length],
            ["stripe_unknown", overview.segments.stripe_unknown.length],
          ] as const
        ).map(([key, count]) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardDescription>
                {key === "admin_manual"
                  ? "Admin manual"
                  : STRIPE_SEGMENT_META[key as StripeSegmentKey]?.title ?? key}
              </CardDescription>
              <CardTitle className="text-2xl">{count}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {(["stripe_monthly", "stripe_yearly", "stripe_unknown"] as const).map((key) => (
        <StripeSegmentCard
          key={key}
          segmentKey={key}
          rows={overview.segments[key]}
          plans={overview.plans}
          rowProgress={rowProgress}
          rowErrors={rowErrors}
          onMigrate={handleMigrateStripe}
        />
      ))}

      <AdminManualListCard rows={overview.segments.admin_manual} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Already migrated
            <Badge variant="outline">{migrated.length}</Badge>
          </CardTitle>
          <CardDescription>
            Users moved to package billing with a migrated legacy subscription.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {migrated.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Assigned plan</TableHead>
                    <TableHead>Period end</TableHead>
                    <TableHead>Migration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {migrated.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell>
                        <Link
                          to={`/users/${row.userId}/info`}
                          className="font-medium hover:underline"
                        >
                          {row.userName || row.userEmail}
                        </Link>
                      </TableCell>
                      <TableCell>{row.assignedPlanName ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(row.currentPeriodEnd), "PPP")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Migrated
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
