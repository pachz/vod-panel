import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useConvexAuth, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import {
  initPosthogClient,
  resetPosthog,
  setPosthogUser,
  trackPosthogEvent,
} from "@/lib/posthog";

const toPathKey = (pathname: string, search: string, hash: string) => `${pathname}${search}${hash}`;

const AnalyticsListener = () => {
  const location = useLocation();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  // Use safe query that doesn't throw when unauthenticated
  const currentUser = useQuery(api.user.getCurrentUserSafe);

  const initAttemptedRef = useRef(false);
  const lastPathRef = useRef<string | null>(null);
  const identifiedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (initAttemptedRef.current) {
      return;
    }

    initAttemptedRef.current = initPosthogClient({
      apiKey: import.meta.env.VITE_POSTHOG_KEY,
      host: import.meta.env.VITE_POSTHOG_HOST,
    });
  }, []);

  const userLoaded = useMemo(() => {
    if (isAuthLoading || !isAuthenticated) {
      return false;
    }

    return currentUser !== undefined && currentUser !== null;
  }, [currentUser, isAuthLoading, isAuthenticated]);

  useEffect(() => {
    if (!userLoaded || !currentUser) {
      return;
    }

    const ready = setPosthogUser({
      id: currentUser._id,
      email: currentUser.email,
      name: currentUser.name,
      phone: currentUser.phone,
      role: currentUser.isGod ? "admin" : "user",
    });

    if (ready && identifiedUserRef.current !== currentUser._id) {
      trackPosthogEvent("$identify", {
        $set: {
          email: currentUser.email ?? undefined,
          name: currentUser.name ?? undefined,
          phone: currentUser.phone ?? undefined,
          role: currentUser.isGod ? "admin" : "user",
        },
      });
      identifiedUserRef.current = currentUser._id;
    }
  }, [currentUser, userLoaded]);

  useEffect(() => {
    if (!userLoaded) {
      return;
    }

    const pathKey = toPathKey(location.pathname, location.search, location.hash);

    if (lastPathRef.current === pathKey) {
      return;
    }

    lastPathRef.current = pathKey;

    const sendPageView = () => {
      trackPosthogEvent("pageview", {
        path: location.pathname,
        search: location.search,
        hash: location.hash,
        title: document.title,
        referrer: document.referrer,
      });
    };

    if (document.readyState === "complete") {
      sendPageView();
      return;
    }

    const onLoad = () => {
      sendPageView();
    };

    window.addEventListener("load", onLoad, { once: true });

    return () => {
      window.removeEventListener("load", onLoad);
    };
  }, [location.hash, location.pathname, location.search, userLoaded]);

  useEffect(() => {
    if (!isAuthenticated && identifiedUserRef.current) {
      resetPosthog();
      identifiedUserRef.current = null;
      lastPathRef.current = null;
    }
  }, [isAuthenticated]);

  return null;
};

export default AnalyticsListener;

