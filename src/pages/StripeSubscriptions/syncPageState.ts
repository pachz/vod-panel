import type { Id } from "../../../convex/_generated/dataModel";

export type ComparisonRow = {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripeCustomerEmail: string | null;
  stripeStatus: string;
  stripePriceId: string | null;
  stripeCurrentPeriodStart: number;
  stripeCurrentPeriodEnd: number;
  stripeCancelAtPeriodEnd: boolean;
  localSubscriptionDocId: Id<"subscriptions"> | null;
  localUserId: Id<"users"> | null;
  localUserName: string | null;
  localUserEmail: string | null;
  localStatus: string | null;
  localCurrentPeriodStart: number | null;
  localCurrentPeriodEnd: number | null;
  localCancelAtPeriodEnd: boolean | null;
  localStripePriceId: string | null;
  localRenewalStripePriceId: string | null;
  localPlanId: Id<"subscriptionPlans"> | null;
  localPlanName: string | null;
  legacyMigrationStatus: "migrated" | null;
  stripePriceLinkedToPlan: boolean;
  needsPackageAssignment: boolean;
  mappedUserId: Id<"users"> | null;
  mappedUserName: string | null;
  mappedUserEmail: string | null;
  inSync: boolean;
  syncNeeded: boolean;
  canSync: boolean;
  syncReasons: string[];
  expectedDifferences: string[];
};

export type StatusFilter =
  | "all"
  | "active"
  | "canceled"
  | "past_due"
  | "unpaid"
  | "incomplete"
  | "trialing";

export type ViewFilter = "all" | "needs_sync" | "needs_package" | "in_sync";

export type PersistedSyncPageState = {
  rows: ComparisonRow[];
  hasMore: boolean;
  nextCursor: string | null;
  statusFilter: StatusFilter;
  viewFilter: ViewFilter;
  loadedOnce: boolean;
};

const STORAGE_KEY = "vod-panel:stripe-subscription-sync";

export function readPersistedSyncPageState(): PersistedSyncPageState | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedSyncPageState;
    if (!Array.isArray(parsed.rows)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writePersistedSyncPageState(state: PersistedSyncPageState): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors for large result sets.
  }
}

export function clearPersistedSyncPageState(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.removeItem(STORAGE_KEY);
}
