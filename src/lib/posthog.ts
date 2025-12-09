type PosthogUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  role?: string | null;
};

type PosthogEvent = {
  event: string;
  properties?: Record<string, unknown> & {
    $set?: Record<string, unknown>;
  };
};

const DEFAULT_HOST = "https://us.i.posthog.com";

let apiKey: string | null = null;
let host: string = DEFAULT_HOST;
let initialized = false;
let pageLoaded = typeof document !== "undefined" && document.readyState !== "loading";
let currentUser: PosthogUser | null = null;
let pendingEvents: PosthogEvent[] = [];

const getCaptureEndpoint = () => `${host.replace(/\/$/, "")}/capture/`;

const markPageLoaded = () => {
  if (pageLoaded) {
    return;
  }

  if (typeof window !== "undefined") {
    window.addEventListener(
      "load",
      () => {
        pageLoaded = true;
        flushQueue();
      },
      { once: true }
    );
  }
};

export const initPosthogClient = (options: { apiKey?: string; host?: string }) => {
  if (initialized) {
    return true;
  }

  if (!options.apiKey) {
    console.warn("PostHog key missing; analytics disabled.");
    return false;
  }

  apiKey = options.apiKey;
  host = options.host?.replace(/\/$/, "") || DEFAULT_HOST;
  initialized = true;

  markPageLoaded();
  flushQueue();
  return true;
};

const isReady = () => initialized && pageLoaded && Boolean(apiKey) && Boolean(currentUser);

const sendEvent = (payload: PosthogEvent) => {
  if (!apiKey || !currentUser) {
    return false;
  }

  const mergedProperties: Record<string, unknown> = {
    ...payload.properties,
    user_id: currentUser.id,
    user_email: currentUser.email ?? undefined,
    user_name: currentUser.name ?? undefined,
    user_phone: currentUser.phone ?? undefined,
    user_role: currentUser.role ?? undefined,
    $current_url: typeof window !== "undefined" ? window.location.href : undefined,
    $pathname: typeof window !== "undefined" ? window.location.pathname : undefined,
  };

  const body = JSON.stringify({
    api_key: apiKey,
    event: payload.event,
    distinct_id: currentUser.id,
    properties: mergedProperties,
  });

  const endpoint = getCaptureEndpoint();

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
    } else {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        /* ignore network errors */
      });
    }
  } catch {
    return false;
  }

  return true;
};

const flushQueue = () => {
  if (!isReady() || pendingEvents.length === 0) {
    return;
  }

  const events = [...pendingEvents];
  pendingEvents = [];
  events.forEach((payload) => sendEvent(payload));
};

export const setPosthogUser = (user: PosthogUser | null) => {
  currentUser = user;

  if (!user) {
    pendingEvents = [];
    return false;
  }

  flushQueue();
  return isReady();
};

export const trackPosthogEvent = (event: string, properties?: PosthogEvent["properties"]) => {
  const payload: PosthogEvent = { event, properties };

  if (!isReady()) {
    pendingEvents.push(payload);
    return false;
  }

  return sendEvent(payload);
};

export const resetPosthog = () => {
  pendingEvents = [];
  currentUser = null;
};

