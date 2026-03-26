/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VOD_SITE_URL?: string;
}

interface Window {
  dataLayer?: Array<Record<string, unknown>>;
}

