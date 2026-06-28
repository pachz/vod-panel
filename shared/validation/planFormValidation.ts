import type { ZodError } from "zod";

/** DOM ids for plan editor fields — used for focus + inline errors. */
export const PLAN_FORM_FIELD_IDS = {
  name: "plan-field-name",
  nameAr: "plan-field-nameAr",
  slug: "plan-field-slug",
  priceSubtitle: "plan-field-priceSubtitle",
  priceSubtitleAr: "plan-field-priceSubtitleAr",
  ribbonText: "plan-field-ribbonText",
  ribbonTextAr: "plan-field-ribbonTextAr",
  inheritsDescription: "plan-field-inheritsDescription",
  inheritsDescriptionAr: "plan-field-inheritsDescriptionAr",
  features: "plan-field-features",
} as const;

export type PlanFormFieldKey = keyof typeof PLAN_FORM_FIELD_IDS;

const TOP_LEVEL_PATH_TO_FIELD: Record<string, PlanFormFieldKey> = {
  name: "name",
  nameAr: "nameAr",
  slug: "slug",
  priceSubtitle: "priceSubtitle",
  priceSubtitleAr: "priceSubtitleAr",
  ribbonText: "ribbonText",
  ribbonTextAr: "ribbonTextAr",
  inheritsDescription: "inheritsDescription",
  inheritsDescriptionAr: "inheritsDescriptionAr",
};

export function getPlanFormFieldKey(path: (string | number)[]): PlanFormFieldKey | null {
  if (path.length === 0) return null;
  if (path[0] === "features") return "features";
  const key = String(path[0]);
  return TOP_LEVEL_PATH_TO_FIELD[key] ?? null;
}

export function collectPlanFormFieldErrors(
  error: ZodError,
): Partial<Record<PlanFormFieldKey, string>> {
  const out: Partial<Record<PlanFormFieldKey, string>> = {};

  for (const issue of error.errors) {
    const fieldKey = getPlanFormFieldKey(issue.path);
    if (!fieldKey || out[fieldKey]) continue;

    if (fieldKey === "features") {
      const index = issue.path[1];
      const subField = issue.path[2];
      const featureLabel =
        typeof index === "number" ? `Feature ${index + 1}` : "Feature";
      const subLabel =
        subField === "titleAr"
          ? " (Arabic title)"
          : subField === "title"
            ? " (English title)"
            : subField != null
              ? ` (${String(subField)})`
              : "";
      out.features = `${featureLabel}${subLabel}: ${issue.message}`;
      continue;
    }

    out[fieldKey] = issue.message;
  }

  return out;
}

export function getFirstPlanFormFieldErrorKey(error: ZodError): PlanFormFieldKey | null {
  for (const issue of error.errors) {
    const key = getPlanFormFieldKey(issue.path);
    if (key) return key;
  }
  return null;
}

export function formatPlanValidationMessage(error: ZodError): string {
  const first = error.errors[0];
  if (!first) return "Please check the form and try again.";

  const fieldKey = getPlanFormFieldKey(first.path);
  if (fieldKey === "features") {
    return collectPlanFormFieldErrors(error).features ?? first.message;
  }

  return first.message;
}

export function focusPlanFormField(key: PlanFormFieldKey): void {
  const id = PLAN_FORM_FIELD_IDS[key];
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (el instanceof HTMLElement && typeof el.focus === "function") {
    el.focus({ preventScroll: true });
  }
}
