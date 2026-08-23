"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Toast } from "@/components/Toast";
import { DESTINATION_OPTIONS, filterDestinations } from "@/lib/destinations";
import { createClient } from "@/lib/supabase/client";

export function DestinationSettings({
  initialCodes,
}: {
  initialCodes: string[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(initialCodes);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => filterDestinations(query), [query]);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    setSelected(initialCodes);
  }, [initialCodes]);

  function toggle(code: string) {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  async function save() {
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    setToast("Hedef destinasyonların kaydedildi.");
    setLoading(false);
  }

  return (
    <div className="settings-block">
      {toast ? <Toast message={toast} onClose={dismissToast} /> : null}
      <p className="account-muted">
        Takip etmek istediğin şehirleri işaretle. Vitrin filtresi ve SMS
        uyarıları bu listedeki destinasyonlara göre çalışır.
      </p>
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
          ? `${selected.length} destinasyon seçili`
          : "Henüz destinasyon seçilmedi"}
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

      <div className="onboarding-actions">
        <button
          type="button"
          className="btn btn-onboarding"
          disabled={loading}
          onClick={() => void save()}
        >
          {loading ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
