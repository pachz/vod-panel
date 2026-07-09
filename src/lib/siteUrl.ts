export type SiteLanguage = "en" | "ar";

const DEFAULT_VOD_SITE_HOST = "www.rehamdiva.com";

export function getVodSiteHost(): string {
  return import.meta.env.VITE_VOD_SITE_URL || DEFAULT_VOD_SITE_HOST;
}

/** Builds a localized URL on the main marketing site, e.g. https://www.rehamdiva.com/ar/ */
export function getLocalizedSiteUrl(language: SiteLanguage, path = ""): string {
  const host = getVodSiteHost();
  const locale = language === "ar" ? "ar" : "en";
  const normalizedPath = path.replace(/^\//, "").replace(/\/$/, "");

  if (!normalizedPath) {
    return `https://${host}/${locale}/`;
  }

  return `https://${host}/${locale}/${normalizedPath}`;
}
