"use client";

import { useEffect } from "react";
import { SIGNUP_COOKIE, trackEvent } from "@/lib/analytics";

export function SignupTracker() {
  useEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${SIGNUP_COOKIE}=([^;]*)`));
    if (!match) return;
    document.cookie = `${SIGNUP_COOKIE}=; path=/; max-age=0`;
    trackEvent("sign_up", { method: decodeURIComponent(match[1] ?? "") || "google" });
  }, []);
  return null;
}
