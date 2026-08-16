"use client";

import { useEffect, useMemo, useState } from "react";
import { VitrinFilters } from "@/components/vitrin/VitrinFilters";
import { DealCard } from "@/components/vitrin/DealCard";
import {
  airportsFromDepartureCode,
  type DepartureAirport,
} from "@/lib/departures";
import { destinationByCode } from "@/lib/destinations";
import {
  cheapestDealPerCity,
  dealMatchesDests,
  dealMatchesOrigins,
  dealWithinStopLimit,
} from "@/lib/deal-display";
import { sortByFoundAt } from "@/lib/scan/deal-archive";
import { createClient } from "@/lib/supabase/client";
import type { Deal, DealsPayload } from "@/lib/types";

export function AccountDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [airports, setAirports] = useState<DepartureAirport[]>(
    airportsFromDepartureCode("IST"),
  );
  const [dests, setDests] = useState<{ code: string; name: string }[]>([]);
  const [selectedOrigins, setSelectedOrigins] = useState<string[]>(
    airportsFromDepartureCode("IST").map((a) => a.code),
  );
  const [selectedDests, setSelectedDests] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(0);
  const [boundMin, setBoundMin] = useState(0);
  const [boundMax, setBoundMax] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = createClient();
      let departureCode = "IST";
      let destCodes: string[] = [];

      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("departure_code, destination_codes")
            .eq("id", user.id)
            .maybeSingle();
          if (profile?.departure_code) departureCode = profile.departure_code;
          destCodes = profile?.destination_codes ?? [];
        }
      }

      if (!active) return;

      const nextAirports = airportsFromDepartureCode(departureCode);
      setAirports(nextAirports);
      setSelectedOrigins(nextAirports.map((a) => a.code));
      setDests(
        destCodes
          .map((code) => {
            const found = destinationByCode(code);
            return found
              ? { code: found.code, name: found.name }
              : { code, name: code };
          })
          .sort((a, b) => a.name.localeCompare(b.name, "tr")),
      );

      try {
        const res = await fetch("/api/deals");
        const payload = (await res.json()) as DealsPayload & { error?: string };
        if (!active) return;
        if (!res.ok) {
          setWarning(payload.error || "Fırsatlar yüklenemedi.");
          setDeals([]);
        } else {
          const nextDeals = payload.deals ?? [];
          setDeals(nextDeals);
          setWarning(payload.warning ?? null);
          const prices = nextDeals.map((d) => d.price).filter((n) => n > 0);
          if (prices.length > 0) {
            const lo = Math.floor(Math.min(...prices));
            const hi = Math.ceil(Math.max(...prices));
            setBoundMin(lo);
            setBoundMax(hi);
            setPriceMin(lo);
            setPriceMax(hi);
          }
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
    () =>
      sortByFoundAt(
        cheapestDealPerCity(
          deals.filter(
            (d) =>
              dealMatchesOrigins(d, selectedOrigins) &&
              dealMatchesDests(d, selectedDests) &&
              dealWithinStopLimit(d) &&
              d.price >= priceMin &&
              d.price <= priceMax,
          ),
        ),
      ),
    [deals, selectedOrigins, selectedDests, priceMin, priceMax],
  );

  const allOriginCodes = airports.map((a) => a.code);
  const originsAll =
    selectedOrigins.length === allOriginCodes.length &&
    allOriginCodes.every((c) => selectedOrigins.includes(c));
  const priceAll =
    boundMax <= boundMin || (priceMin <= boundMin && priceMax >= boundMax);
  const canClear = !originsAll || selectedDests.length > 0 || !priceAll;

  function clearFilters() {
    setSelectedOrigins(allOriginCodes);
    setSelectedDests([]);
    setPriceMin(boundMin);
    setPriceMax(boundMax);
  }

  return (
    <div className="account-section">
      <VitrinFilters
        airports={airports}
        selectedOrigins={selectedOrigins}
        onOriginsChange={setSelectedOrigins}
        dests={dests}
        selectedDests={selectedDests}
        onDestsChange={setSelectedDests}
        priceMin={priceMin}
        priceMax={priceMax}
        boundMin={boundMin}
        boundMax={Math.max(boundMax, boundMin)}
        onPriceChange={(min, max) => {
          setPriceMin(min);
          setPriceMax(max);
        }}
        onClear={clearFilters}
        canClear={canClear}
      />
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
