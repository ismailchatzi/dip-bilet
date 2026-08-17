"use client";

import { DestPhoto } from "@/components/vitrin/DestPhoto";
import {
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
            Kalkışınından dünyaya — daha önce yakalanmış örnek dip fırsatlar.
            Süresi dolmuş olabilir; bir sonrakini kaçırma.
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
          return (
          <article key={deal.id} className="deal-card">
            <DestPhoto
              dest={deal.destination}
              alt={deal.destination}
              className="deal-card__media"
            />
            <div className="deal-card__body">
              <p className="deal-card__route">
                {deal.departureLabel} → {deal.destination}
              </p>
              <p className="deal-card__price">
                <strong>{formatMoney(shownPrice, deal.currency)}</strong>
                {typeof deal.averagePrice === "number" ? (
                  <s>{formatMoney(deal.averagePrice, deal.currency)}</s>
                ) : null}
              </p>
              {typeof shownOff === "number" ? (
                <p className="deal-card__off">%{shownOff} altında</p>
              ) : null}
              {dealFoundLabel(deal) ? (
                <p className="deal-card__found">{dealFoundLabel(deal)}</p>
              ) : null}
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
