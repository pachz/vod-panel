export type AssistantLanguage = "en" | "ar";

export type CourseAccessStatus = "included" | "locked" | "unknown";

export type CourseSearchResult = {
  id: string;
  title: string;
  description: string;
  slug: string;
  imageUrl?: string;
  category?: string;
  durationMinutes?: number;
  accessStatus: CourseAccessStatus;
  language: AssistantLanguage;
  usedFallbackTranslation: boolean;
};

export type SubscriptionToolResult = {
  authenticated: boolean;
  status:
    | "active"
    | "trialing"
    | "past_due"
    | "canceled"
    | "paused"
    | "none";
  planNameEn?: string;
  planNameAr?: string;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  hasBillingAccount: boolean;
};

export type BillingPortalResult = {
  url: string;
};

export type ParsedToolResults = {
  courses: CourseSearchResult[];
  subscription: SubscriptionToolResult | null;
  billingPortalUrl: string | null;
};
