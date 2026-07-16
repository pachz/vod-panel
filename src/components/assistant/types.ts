export type AssistantLanguage = "en" | "ar";

export type CourseAccessStatus = "included" | "locked" | "unknown";

export type CourseSearchResult = {
  id: string;
  title: string;
  titleEn?: string;
  titleAr?: string;
  description: string;
  descriptionEn?: string;
  descriptionAr?: string;
  slug: string;
  imageUrl?: string;
  category?: string;
  categoryEn?: string;
  categoryAr?: string;
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
