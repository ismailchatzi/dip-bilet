"use client";

import type { MouseEvent } from "react";
import { trackEvent } from "@/lib/analytics";
import { landingOpenPath, writePrefCity } from "@/lib/landing-pref";

export function LandingCta({ code, label }: { code: string; label: string }) {
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    trackEvent("landing_cta", { city: code });
    const loggedIn = document.cookie
      .split("; ")
      .some((c) => c.startsWith("sb-") && c.split("=")[0]!.includes("-auth-token"));
    if (loggedIn) {
      window.location.href = landingOpenPath(code);
      return;
    }
    writePrefCity(code);
    window.location.href = "/uye-ol";
  }

  return (
    <a href="/uye-ol" className="btn btn-join-blue landing-cta" onClick={onClick}>
      {label}
    </a>
  );
}
