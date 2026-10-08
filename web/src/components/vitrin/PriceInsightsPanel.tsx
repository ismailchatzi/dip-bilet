"use client";

import { PriceAlertForm } from "@/components/vitrin/PriceAlertForm";
import { formatDealMoney } from "@/lib/deal-display";
import {
  cheapestDow,
  cheapestMonth,
  dowLabel,
  monthLabel,
  shortDate,
  type PriceHistoryPoint,
  type PriceInsight,
} from "@/lib/price-insights";
import { useEffect, useState } from "react";

const usd = (n: number) => formatDealMoney(n, "USD");

type BarItem = { key: string; label: string; value: number; on: boolean; title: string };

function Bars({ items }: { items: BarItem[] }) {
  const values = items.map((i) => i.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return (
    <div className="price-guide__bars">
      {items.map((i) => {
        const h = hi > lo ? 28 + (72 * (i.value - lo)) / (hi - lo) : 60;
        return (
          <div key={i.key} className="price-guide__bar-col" title={i.title}>
            <span className="price-guide__bar-val">{usd(i.value)}</span>
            <span
              className={i.on ? "price-guide__bar price-guide__bar--on" : "price-guide__bar"}
              style={{ height: `${h}%` }}
            />
            <span className="price-guide__bar-label">{i.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function HistoryLine({ points }: { points: PriceHistoryPoint[] }) {
  const W = 600;
  const H = 150;
  const pad = 18;
  const totals = points.map((p) => p.total);
  const lo = Math.min(...totals);
  const hi = Math.max(...totals);
  const x = (i: number) => pad + ((W - pad * 2) * i) / Math.max(1, points.length - 1);
  const y = (v: number) => (hi > lo ? pad + ((H - pad * 2) * (hi - v)) / (hi - lo) : H / 2);
  const line = points.map((p, i) => `${x(i)},${y(p.total)}`).join(" ");
  const minIdx = totals.indexOf(lo);
  return (
    <svg className="price-guide__line" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={line} fill="none" stroke="#3aa0c8" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <circle
          key={p.day}
          cx={x(i)}
          cy={y(p.total)}
          r={i === minIdx ? 5 : 3}
          fill={i === minIdx ? "#15803d" : "#3aa0c8"}
          vectorEffect="non-scaling-stroke"
        >
          <title>{`${shortDate(p.day)}: ${usd(p.total)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function PriceInsightsPanel({
  dest,
  cityLabel,
  shownPrice,
  currency,
  out,
  destAirport,
  back,
  od,
  rd,
}: {
  dest: string;
  cityLabel: string;
  shownPrice: number;
  currency: string;
  out: string;
  destAirport: string;
  back: string;
  od: string;
  rd: string;
}) {
  const [insight, setInsight] = useState<PriceInsight | null | undefined>(undefined);
  const [history, setHistory] = useState<PriceHistoryPoint[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/price-insights?dest=${encodeURIComponent(dest)}`)
      .then((r) => (r.ok ? r.json() : { insights: {} }))
      .then((j: { insights?: Record<string, PriceInsight> }) => {
        if (active) setInsight(j.insights?.[dest] ?? null);
      })
      .catch(() => active && setInsight(null));
    return () => {
      active = false;
    };
  }, [dest]);

  useEffect(() => {
    let active = true;
    setHistory(null);
    if (!od || !rd) return;
    const q = new URLSearchParams({ out, dest: destAirport, back, od, rd });
    fetch(`/api/price-history?${q}`)
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .then((j: { points?: PriceHistoryPoint[] }) => {
        if (active) setHistory(j.points ?? []);
      })
      .catch(() => active && setHistory([]));
    return () => {
      active = false;
    };
  }, [out, destAirport, back, od, rd]);

  if (insight === undefined) return null;

  const usdDeal = currency === "USD";
  const bestMonth = insight ? cheapestMonth(insight) : null;
  const bestOut = insight ? cheapestDow(insight.outDow) : null;
  const bestRet = insight ? cheapestDow(insight.retDow) : null;
  const first = history?.[0];
  const last = history?.at(-1);
  const lowest = history?.reduce<PriceHistoryPoint | null>(
    (a, p) => (!a || p.total < a.total ? p : a),
    null,
  );

  return (
    <section className="price-guide">
      <h3>{cityLabel} fiyat rehberi</h3>

      <div className="price-guide__grid">
        {insight && insight.months.length > 0 ? (
          <div className="price-guide__card">
            <h4>Aylara göre fiyat</h4>
            <Bars
              items={insight.months.map((m) => ({
                key: m.month,
                label: monthLabel(m.month, true),
                value: m.median,
                on: m.month === bestMonth?.month,
                title: `${monthLabel(m.month)}: ortalama ${usd(m.median)}, en ucuz ${usd(m.min)} (${shortDate(m.bestOut)} – ${shortDate(m.bestRet)})`,
              }))}
            />
            {bestMonth ? (
              <p className="price-guide__note">
                En ucuz ay <strong>{monthLabel(bestMonth.month)}</strong>: ortalama{" "}
                {usd(bestMonth.median)}, en ucuzu {usd(bestMonth.min)} (
                {shortDate(bestMonth.bestOut)} – {shortDate(bestMonth.bestRet)}).
              </p>
            ) : null}
          </div>
        ) : null}

        {insight && insight.outDow.length === 7 ? (
          <div className="price-guide__card">
            <h4>Haftanın gününe göre (gidiş)</h4>
            <Bars
              items={[1, 2, 3, 4, 5, 6, 0].map((dow) => {
                const row = insight.outDow.find((r) => r.dow === dow)!;
                return {
                  key: String(dow),
                  label: dowLabel(dow, true),
                  value: row.median,
                  on: dow === bestOut?.dow,
                  title: `${dowLabel(dow)} gidiş: ortalama ${usd(row.median)}`,
                };
              })}
            />
            {bestOut ? (
              <p className="price-guide__note">
                Gidiş için en ucuz gün <strong>{dowLabel(bestOut.dow)}</strong>
                {bestRet ? (
                  <>
                    , dönüş için <strong>{dowLabel(bestRet.dow)}</strong>
                  </>
                ) : null}
                .
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="price-guide__card price-guide__card--wide">
          <h4>Bu tarihlerin fiyat geçmişi</h4>
          {history === null ? (
            <p className="price-guide__note">Yükleniyor…</p>
          ) : history.length >= 2 && first && last && lowest ? (
            <>
              <HistoryLine points={history} />
              <div className="price-guide__axis">
                <span>{shortDate(first.day)}</span>
                <span>{shortDate(last.day)}</span>
              </div>
              <p className="price-guide__note">
                İlk taramada ({shortDate(first.day)}) {usd(first.total)}, son taramada (
                {shortDate(last.day)}) {usd(last.total)}. En düşük {usd(lowest.total)} (
                {shortDate(lowest.day)}).
              </p>
            </>
          ) : (
            <p className="price-guide__note">Bu tarihler için henüz yeterli tarama geçmişi yok.</p>
          )}
        </div>
      </div>

      <PriceAlertForm
        dest={dest}
        cityLabel={cityLabel}
        months={insight?.months.map((m) => m.month) ?? []}
        suggested={usdDeal ? shownPrice : undefined}
      />

      <p className="price-guide__foot">
        Grafikler tarama sırasında görülen tek yön fiyatların toplamıdır (USD, yaklaşık
        gidiş-dönüş); canlı bilet fiyatı değildir.
      </p>
    </section>
  );
}
