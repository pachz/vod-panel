/** Whether a plan should appear in public/user-facing plan lists. */
export function isPlanVisibleToUsers(plan: {
  deletedAt?: number;
  isActive: boolean;
  isHidden?: boolean;
}): boolean {
  return plan.deletedAt === undefined && plan.isActive && plan.isHidden !== true;
}
