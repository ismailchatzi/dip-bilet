"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEPARTURE_SEARCH_OPTIONS,
  departureDisplay,
  filterDepartureSearch,
} from "@/lib/departures";
import { createClient } from "@/lib/supabase/client";

export function OnboardingDeparture({
  initialCode,
}: {
  initialCode: string;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState(initialCode || "IST");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => filterDepartureSearch(query), [query]);
  const selected = DEPARTURE_SEARCH_OPTIONS.find((o) => o.code === selectedCode);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function onContinue() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setError("Bağlantı kurulamadı.");
      setLoading(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Oturum bulunamadı.");
      setLoading(false);
      return;
    }

    const { error: err } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? "",
        departure_code: selectedCode,
        onboarding_step: 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    router.push("/onboarding/destinasyonlar");
  }

  return (
    <div className="onboarding-step">
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}

      <div className="onboarding-search" ref={wrapRef}>
        <label className="onboarding-search__label" htmlFor="departure-search">
          Kalkış yeri ara
        </label>
        <input
          id="departure-search"
          type="search"
          className="onboarding-search__input"
          placeholder="Örn. is, istanbul, saw..."
          value={query}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />

        {open && options.length > 0 ? (
          <ul className="onboarding-search__list" role="listbox">
            {options.map((opt) => (
              <li key={opt.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={opt.code === selectedCode}
                  className={[
                    "onboarding-search__option",
                    opt.code === selectedCode
                      ? "onboarding-search__option--selected"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    setSelectedCode(opt.code);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  <strong>{opt.label}</strong>
                  <span>{opt.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {open && query && options.length === 0 ? (
          <p className="onboarding-search__empty">
            Eşleşen kalkış yok. Şimdilik yalnız İstanbul açık.
          </p>
        ) : null}
      </div>

      {selected ? (
        <div className="onboarding-selected">
          <span className="onboarding-selected__label">Seçili kalkış</span>
          <strong>{departureDisplay(selectedCode)}</strong>
        </div>
      ) : null}

      <div className="onboarding-actions">
        <button
          type="button"
          className="btn btn-onboarding"
          disabled={loading || !selectedCode}
          onClick={() => void onContinue()}
        >
          {loading ? "Kaydediliyor…" : "Devam et"}
        </button>
      </div>
    </div>
  );
}
