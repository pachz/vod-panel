# Public assistant widget

Drop-in chat widget for the Next.js marketing site. It talks to the VOD panel Convex HTTP API and does **not** use `LANDING_SECRET`.

The hosted script is the recommended install. A vendored copy of the same file lives next to this README if you prefer to serve it from the landing app.

## 1. Enable it in the panel

Open **Assistant settings → Public website**, turn on **Enable public assistant**, and save the public prompt/tools you want. Members settings are stored separately and are not changed by this tab.

## 2. Recommended: hosted script

In the landing layout (or a locale layout), add:

```tsx
import Script from "next/script";

export function PublicAssistantWidget() {
  return (
    <Script
      src="https://YOUR_DEPLOYMENT.convex.site/landing/public-assistant/widget.js?v=3"
      data-lang="ar"
      strategy="afterInteractive"
    />
  );
}
```

Use `data-lang="en"` on English routes. The exact URL is shown on the Public website settings tab.

Optional attributes:

| Attribute | Meaning |
| --- | --- |
| `data-lang` | `en` or `ar` |
| `data-api-base` | Override API origin if the script is not served from Convex |
| `data-site-host` | Marketing host for course/plan links (default `www.rehamdiva.com`) |

## 3. Vendored script

Copy `reham-assistant-widget.js` into the landing `public/` folder, then:

```tsx
<Script
  src="/reham-assistant-widget.js"
  data-api-base="https://YOUR_DEPLOYMENT.convex.site"
  data-lang="ar"
  strategy="afterInteractive"
/>
```

`data-api-base` is required when the JS is not loaded from `*.convex.site`.

## CORS

Browser requests come from the landing origin. If you need a strict allowlist, set Convex env `PUBLIC_ASSISTANT_ALLOWED_ORIGINS` to a comma-separated list (for example `https://www.rehamdiva.com,http://localhost:3000`). If unset, the widget echoes the request origin.
