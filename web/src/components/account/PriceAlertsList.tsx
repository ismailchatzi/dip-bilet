"use client";

import {
  alertMonthText,
  deletePriceAlert,
  fetchPriceAlerts,
  type PriceAlertRow,
} from "@/components/vitrin/PriceAlertForm";
import { formatDealMoney } from "@/lib/deal-display";
import { findTrackedDestination } from "@/lib/scan/scrappa-targets";
import { useEffect, useState } from "react";

export function PriceAlertsList() {
  const [alerts, setAlerts] = useState<PriceAlertRow[] | null>(null);

  useEffect(() => {
    let active = true;
    void fetchPriceAlerts().then((rows) => {
      if (active) setAlerts(rows);
    });
    return () => {
      active = false;
    };
  }, []);

  async function remove(id: number) {
    if (await deletePriceAlert(id)) {
      setAlerts((rows) => (rows ?? []).filter((a) => a.id !== id));
    }
  }

  return (
    <section className="settings-section">
      <h2>Fiyat alarmları</h2>
      {alerts === null ? null : alerts.length === 0 ? (
        <div className="settings-row">
          <div>
            <strong>Henüz alarm yok</strong>
            <p>Bir fırsatın detay sayfasından şehir için fiyat alarmı kurabilirsin.</p>
          </div>
        </div>
      ) : (
        alerts.map((a) => (
          <div className="settings-row" key={a.id}>
            <div>
              <strong>{findTrackedDestination(a.dest_code)?.name ?? a.dest_code}</strong>
              <p>
                {alertMonthText(a.month)} · {formatDealMoney(Number(a.max_price), a.currency)} altı
              </p>
            </div>
            <button type="button" className="settings-edit" onClick={() => void remove(a.id)}>
              Kaldır
            </button>
          </div>
        ))
      )}
    </section>
  );
}
