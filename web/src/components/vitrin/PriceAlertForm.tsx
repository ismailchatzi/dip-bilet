"use client";

import Link from "next/link";
import { formatDealMoney } from "@/lib/deal-display";
import { monthLabel } from "@/lib/price-insights";
import { useEffect, useState } from "react";

export type PriceAlertRow = {
  id: number;
  dest_code: string;
  month: string | null;
  max_price: number;
  currency: string;
  last_sent_at: string | null;
  created_at: string;
};

export function alertMonthText(month: string | null) {
  return month ? `${monthLabel(month)} ${month.slice(0, 4)}` : "Herhangi bir ay";
}

export async function fetchPriceAlerts(): Promise<PriceAlertRow[]> {
  const res = await fetch("/api/price-alerts", { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as { alerts?: PriceAlertRow[] };
  return json.alerts ?? [];
}

export async function deletePriceAlert(id: number) {
  const res = await fetch(`/api/price-alerts?id=${id}`, { method: "DELETE" });
  return res.ok;
}

function nextMonths(count: number) {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < count; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}

export function PriceAlertForm({
  dest,
  cityLabel,
  months,
  suggested,
}: {
  dest: string;
  cityLabel: string;
  months: string[];
  suggested?: number;
}) {
  const options = months.length > 0 ? months : nextMonths(6);
  const [month, setMonth] = useState("");
  const [price, setPrice] = useState(suggested ? String(Math.round(suggested)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<PriceAlertRow[]>([]);

  useEffect(() => {
    let active = true;
    void fetchPriceAlerts().then((rows) => {
      if (active) setAlerts(rows);
    });
    return () => {
      active = false;
    };
  }, []);

  const mine = alerts.filter((a) => a.dest_code === dest);

  async function create() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dest, month: month || null, maxPrice: Number(price) }),
      });
      const json = (await res.json()) as { alert?: PriceAlertRow; error?: string };
      if (!res.ok || !json.alert) {
        setError(json.error || "Alarm kurulamadı.");
        return;
      }
      setAlerts((rows) => [json.alert!, ...rows]);
    } catch {
      setError("Alarm kurulamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (await deletePriceAlert(id)) {
      setAlerts((rows) => rows.filter((a) => a.id !== id));
    }
  }

  return (
    <div className="price-alert">
      <div className="price-alert__head">
        <h4>Fiyat alarmı</h4>
        <p>
          {cityLabel} için istediğin fiyatın altında bir fırsat vitrine düşünce sana e-posta
          atalım.
        </p>
      </div>
      <div className="price-alert__form">
        <label>
          <span>Ay</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)} disabled={busy}>
            <option value="">Herhangi bir ay</option>
            {options.map((m) => (
              <option key={m} value={m}>
                {alertMonthText(m)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>En fazla ($)</span>
          <input
            type="number"
            inputMode="numeric"
            min={20}
            max={5000}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="price-alert__btn"
          onClick={() => void create()}
          disabled={busy || !price}
        >
          {busy ? "Kuruluyor…" : "Alarm kur"}
        </button>
      </div>
      {error ? <p className="price-alert__error">{error}</p> : null}
      {mine.length > 0 ? (
        <ul className="price-alert__list">
          {mine.map((a) => (
            <li key={a.id}>
              <span>
                {alertMonthText(a.month)} · {formatDealMoney(Number(a.max_price), a.currency)} altı
              </span>
              <button type="button" onClick={() => void remove(a.id)}>
                Kaldır
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="price-alert__more">
        Tüm alarmların: <Link href="/ucus-ayarlari">Uçuş ayarları</Link>
      </p>
    </div>
  );
}
