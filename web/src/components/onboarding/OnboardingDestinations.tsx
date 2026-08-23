"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DESTINATION_OPTIONS, filterDestinations } from "@/lib/destinations";
import { createClient } from "@/lib/supabase/client";

export function OnboardingDestinations({
  initialCodes,
}: {
  initialCodes: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(initialCodes);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => filterDestinations(query), [query]);

  function toggle(code: string) {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  async function onContinue() {
    if (selected.length === 0) {
      setError("En az bir destinasyon seç.");
      return;
    }
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
        destination_codes: selected.map((c) => c.trim().toUpperCase()),
        onboarding_step: 2,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    router.push("/onboarding/bildirimler");
  }

  return (
    <div className="onboarding-step">
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}

      <input
        type="search"
        className="onboarding-search__input onboarding-search__input--solo"
        placeholder="Destinasyon ara (örn. bali, dps, paris…)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <p className="onboarding-hint">
        {selected.length > 0
          ? `${selected.length} destinasyon seçildi`
          : "Takip etmek istediğin yerleri işaretle"}
      </p>

      <div className="destination-grid" role="group" aria-label="Destinasyonlar">
        {(query ? filtered : DESTINATION_OPTIONS).map((dest) => {
          const on = selected.includes(dest.code);
          return (
            <button
              key={dest.code}
              type="button"
              className={[
                "destination-chip",
                on ? "destination-chip--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={on}
              onClick={() => toggle(dest.code)}
            >
              <span className="destination-chip__label">{dest.displayLabel}</span>
              <span className="destination-chip__name">{dest.name}</span>
            </button>
          );
        })}
      </div>

      <div className="onboarding-actions onboarding-actions--split">
        <button
          type="button"
          className="btn btn-onboarding-ghost"
          onClick={() => router.push("/onboarding/kalkis")}
        >
          Geri
        </button>
        <button
          type="button"
          className="btn btn-onboarding"
          disabled={loading}
          onClick={() => void onContinue()}
        >
          {loading ? "Kaydediliyor…" : "Devam et"}
        </button>
      </div>
    </div>
  );
}
