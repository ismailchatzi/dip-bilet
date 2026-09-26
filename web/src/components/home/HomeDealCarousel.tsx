"use client";

import { DestPhoto } from "@/components/vitrin/DestPhoto";
import {
  dealCityName,
  dealCityTitle,
  dealDestCode,
  dealFoundLabel,
  displayDealDiscountPercent,
  displayDealPrice,
} from "@/lib/deal-display";
import type { Deal } from "@/lib/types";
import { useRef } from "react";

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("tr-TR")} ${currency}`;
  }
}

function monthName(iso?: string) {
  if (!iso) return null;
  const t = Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const m = new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(t));
  return m.charAt(0).toLocaleUpperCase("tr-TR") + m.slice(1);
}

/** Ay + aktarma; tam tarih üyeye kalır. */
function tripWhen(deal: Deal) {
  const out = monthName(deal.outboundDate);
  const back = monthName(deal.returnDate);
  const months = out && back && out !== back ? `${out}–${back}` : out;
  const stops =
    typeof deal.stops === "number"
      ? deal.stops === 0
        ? "Direkt"
        : `${deal.stops} aktarma`
      : null;
  return [months, stops].filter(Boolean).join(" · ");
}

export function HomeDealCarousel({ deals }: { deals: Deal[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scroll(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 280, behavior: "smooth" });
  }

  return (
    <section className="home-deals" id="arsiv">
      <div className="home-deals__head">
        <div>
          <h2>Son yakalanan fırsatlar</h2>
          <p>
            İstanbul’dan dünyaya — son günlerde yakalanan dip fiyatlar. Tarihler
            ve yeni fırsatlar üyelerde; fiyatlar değişebilir.
          </p>
        </div>
        <div className="home-deals__arrows">
          <button type="button" aria-label="Önceki" onClick={() => scroll(-1)}>
            ‹
          </button>
          <button type="button" aria-label="Sonraki" onClick={() => scroll(1)}>
            ›
          </button>
        </div>
      </div>

      <div className="home-deals__track" ref={scrollerRef}>
        {deals.map((deal) => {
          const shownPrice = displayDealPrice(deal.price);
          const shownOff = displayDealDiscountPercent(deal);
          const when = tripWhen(deal);
          const found = dealFoundLabel(deal);
          return (
            <article key={deal.id} className="deal-card">
              <DestPhoto
                dest={dealDestCode(deal) || deal.destination}
                alt={dealCityTitle(deal)}
                className="deal-card__media"
                imageUrl={deal.photoUrl}
                seed={deal.id}
              >
                {typeof shownOff === "number" ? (
                  <span className="deal-card__badge">%{shownOff} altında</span>
                ) : null}
                <div className="deal-card__overlay">
                  <h3 className="deal-card__city">{dealCityName(deal)}</h3>
                  {when ? <p className="deal-card__when">{when}</p> : null}
                </div>
              </DestPhoto>
              <div className="deal-card__body">
                <p className="deal-card__route">
                  {deal.departureLabel} → {deal.destination}
                </p>
                <p className="deal-card__price">
                  <strong>{formatMoney(shownPrice, deal.currency)}</strong>
                  {typeof deal.averagePrice === "number" ? (
                    <s>{formatMoney(deal.averagePrice, deal.currency)}</s>
                  ) : null}
                  {deal.returnDate ? (
                    <span className="deal-card__rt">gidiş-dönüş</span>
                  ) : null}
                </p>
                {found ? <p className="deal-card__found">{found}</p> : null}
                <a className="deal-card__cta" href="/uye-ol">
                  Fırsatları gör →
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
