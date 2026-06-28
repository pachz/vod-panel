export const SUBSCRIPTION_MODEL = {
  LEGACY: "legacy",
  PACKAGES: "packages",
} as const;

export type SubscriptionModel =
  (typeof SUBSCRIPTION_MODEL)[keyof typeof SUBSCRIPTION_MODEL];

/** Users without an explicit model use legacy billing (all-access subscription). */
export function usesPackageSubscriptionModel(
  user:
    | { subscriptionModel?: SubscriptionModel; isGod?: boolean }
    | null
    | undefined,
): boolean {
  return (
    user?.isGod === true ||
    user?.subscriptionModel === SUBSCRIPTION_MODEL.PACKAGES
  );
}

export function subscriptionModelLabel(
  model: SubscriptionModel | undefined,
): "Legacy" | "Packages" {
  return usesPackageSubscriptionModel({ subscriptionModel: model })
    ? "Packages"
    : "Legacy";
}
