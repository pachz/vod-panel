export type GtmViewContentPayload = {
  content_id: string;
  content_name: string;
  content_category: string;
  value: number;
  currency: string;
  language: string;
};

export function pushGtmViewContent(payload: GtmViewContentPayload) {
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    event: "view_content",
    ...payload,
  });
}

export type GtmCompleteRegistrationPayload = {
  registration_method: "google" | "password";
  user_status: "active";
  language: "en" | "ar";
  user_id?: string;
};

/** Fired after self-service signup (new user only). */
export function pushGtmCompleteRegistration(payload: GtmCompleteRegistrationPayload) {
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    event: "complete_registration",
    ...payload,
  });
}

/** Set before `signIn("google")` so we can attribute `complete_registration` after OAuth redirect. */
export const GTM_GOOGLE_OAUTH_PENDING_KEY = "gtm_google_oauth_registration_pending";

export type GtmBeginCheckoutPayload = {
  contents_ids: string[];
  contents: Array<{ id: string; quantity: number; item_price: number }>;
  num_items: number;
  value: number;
  currency: string;
};

/** Payment fields needed to mirror Stripe checkout line item (amounts in minor units, e.g. cents). */
export type GtmPaymentSettingsForCheckout = {
  selectedMonthlyPriceId: string;
  monthlyPriceAmount: number;
  monthlyPriceCurrency: string;
  selectedYearlyPriceId?: string | null;
  yearlyPriceAmount?: number | null;
  yearlyPriceCurrency?: string | null;
};

/**
 * Resolves which price the backend will use for `createCheckoutSession({ priceId })`
 * and builds the `begin_checkout` payload. Amounts are converted to currency units for GTM.
 */
export function buildBeginCheckoutGtmPayload(
  settings: GtmPaymentSettingsForCheckout,
  priceId?: string,
): GtmBeginCheckoutPayload | null {
  const monthlyId = settings.selectedMonthlyPriceId;
  const yearlyId = settings.selectedYearlyPriceId ?? undefined;
  const allowed = [monthlyId, yearlyId].filter((id): id is string => !!id);
  const resolvedId =
    priceId && allowed.includes(priceId) ? priceId : monthlyId;
  if (!resolvedId) {
    return null;
  }

  const isYearlyPrice = !!yearlyId && resolvedId === yearlyId;
  const hasYearlyPricing =
    settings.yearlyPriceAmount != null && settings.yearlyPriceCurrency != null;

  const amountMinor = isYearlyPrice && hasYearlyPricing
    ? settings.yearlyPriceAmount!
    : settings.monthlyPriceAmount;
  const currencyRaw = isYearlyPrice && hasYearlyPricing
    ? settings.yearlyPriceCurrency!
    : settings.monthlyPriceCurrency;
  const currency = currencyRaw.toLowerCase();

  const value = amountMinor / 100;

  return {
    contents_ids: [resolvedId],
    contents: [{ id: resolvedId, quantity: 1, item_price: value }],
    num_items: 1,
    value,
    currency,
  };
}

export function pushGtmBeginCheckout(payload: GtmBeginCheckoutPayload) {
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    event: "begin_checkout",
    ...payload,
  });
}

export type GtmPurchasePayload = {
  order_id: string;
  transaction_id: string;
  content_ids: string[];
  contents: Array<{ id: string; quantity: number; item_price: number }>;
  num_items: number;
  value: number;
  currency: string;
};

export function pushGtmPurchase(payload: GtmPurchasePayload) {
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    event: "purchase",
    ...payload,
  });
}

/** SessionStorage key prefix — set after a successful `purchase` push to avoid duplicates on refresh. */
export const GTM_PURCHASE_SESSION_KEY_PREFIX = "gtm_purchase_sent_";
