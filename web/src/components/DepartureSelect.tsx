"use client";

import { useEffect, useState } from "react";
import {
  DEPARTURE_OPTIONS,
  DEFAULT_DEPARTURE_CODE,
  departureDisplay,
} from "@/lib/departures";
import { createClient } from "@/lib/supabase/client";

export function DepartureSelect({
  initialCode,
  onChange,
}: {
  initialCode?: string | null;
  onChange?: (code: string) => void;
}) {
  const [code, setCode] = useState(initialCode || DEFAULT_DEPARTURE_CODE);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);

  async function select(next: string, available: boolean) {
    if (!available || next === code || loading) return;
    setError(null);
    setSaved(false);
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

    const { error: updateError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? "",
        departure_code: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setCode(next);
    onChange?.(next);
    setSaved(true);
    setLoading(false);
  }

  return (
    <div className="account-prefs departure-prefs">
      <h2>Kalkış yeri</h2>
      <p>
        Dip taramaları seçtiğin kalkışa göre çalışır. Şimdilik İstanbul açık;
        diğer şehirler sırada.
      </p>
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
      {saved ? (
        <p className="auth-alert auth-alert--ok" role="status">
          Kalkışın kaydedildi: {departureDisplay(code)}. Senin için taramaya
          devam ediyoruz.
        </p>
      ) : null}
      <div className="departure-grid" role="listbox" aria-label="Kalkış yeri">
        {DEPARTURE_OPTIONS.map((opt) => {
          const selected = code === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              role="option"
              aria-selected={selected}
              disabled={!opt.available || loading}
              className={[
                "departure-chip",
                selected ? "departure-chip--selected" : "",
                !opt.available ? "departure-chip--soon" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => select(opt.code, opt.available)}
            >
              <span className="departure-chip__city">{opt.label}</span>
              <span className="departure-chip__airports">{opt.airports}</span>
              {!opt.available ? (
                <span className="departure-chip__badge">Yakında</span>
              ) : selected ? (
                <span className="departure-chip__badge departure-chip__badge--on">
                  Seçili
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
