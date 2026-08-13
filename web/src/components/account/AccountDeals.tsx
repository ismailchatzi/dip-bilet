"use client";

import { useEffect, useMemo, useState } from "react";
import { DepartureSelect } from "@/components/DepartureSelect";
import { DealCard } from "@/components/vitrin/DealCard";
import { departureCityHeadline, departureDisplay } from "@/lib/departures";
import { dealMatchesDeparture } from "@/lib/deal-display";
import { createClient } from "@/lib/supabase/client";
import type { Deal, DealsPayload } from "@/lib/types";

export function AccountDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [departureCode, setDepartureCode] = useState("IST");

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = createClient();
      let code = "IST";

      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("departure_code")
            .eq("id", user.id)
            .maybeSingle();
          if (profile?.departure_code) code = profile.departure_code;
        }
      }

      if (!active) return;
      setDepartureCode(code);
      const label = departureDisplay(code);

      try {
        const res = await fetch("/api/deals");
        const payload = (await res.json()) as DealsPayload & { error?: string };
        if (!active) return;
        if (!res.ok) {
          setWarning(payload.error || "Fırsatlar yüklenemedi.");
          setDeals([]);
        } else {
          setDeals(
            (payload.deals ?? []).map((d) => ({
              ...d,
              departureLabel: d.departureLabel || label,
            })),
          );
          setWarning(payload.warning ?? null);
        }
      } catch {
        if (active) {
          setWarning("Fırsatlar yüklenemedi.");
          setDeals([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(
    () => deals.filter((d) => dealMatchesDeparture(d, departureCode)),
    [deals, departureCode],
  );

  const showcaseTitle = `${departureCityHeadline(departureCode)} KALKIŞLI DİP FİYAT VİTRİNİN`;

  return (
    <div className="account-section">
      <DepartureSelect
        initialCode={departureCode}
        onChange={setDepartureCode}
      />
      <h3 className="account-section__title account-section__title--graffiti">
        {showcaseTitle}
      </h3>
      {loading ? <p className="account-muted">Yükleniyor…</p> : null}
      {warning &&
      !warning.includes("eşiğin") &&
      !warning.includes("Tarama tamam") ? (
        <p className="auth-alert auth-alert--error" role="status">
          {warning}
        </p>
      ) : null}
      {!loading && visible.length === 0 ? (
        <div className="empty">
          Şu an eşiğin üzerinde dip fırsat yok. Biraz sonra tekrar bak.
        </div>
      ) : null}
      {visible.length > 0 ? (
        <div className="vitrin-grid">
          {visible.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
