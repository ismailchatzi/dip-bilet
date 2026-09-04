"use client";

import type { CarRentalCard, CarRentalProvider } from "@/lib/affiliate/car-rental-types";
import { tripExtrasSupported } from "@/lib/affiliate/trip-extras";
import { useEffect, useRef, useState, type MouseEvent } from "react";

type Payload = {
  location: string;
  searchUrl: string;
  cards: CarRentalCard[];
  pickupDate?: string;
  dropoffDate?: string;
  rentalDays?: number;
  datesAdjusted?: boolean;
  provider?: CarRentalProvider;
  livePrices?: boolean;
};

const PROVIDER_LABEL: Record<CarRentalProvider, string> = {
  qeeq: "QEEQ",
  economybookings: "EconomyBookings",
};

export function CarRentalCarousel({
  cityLabel,
  destIata,
  pickupDate,
  dropoffDate,
}: {
  cityLabel: string;
  destIata: string;
  pickupDate: string;
  dropoffDate: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  const code = destIata.trim().toUpperCase();
  const supported = Boolean(code && tripExtrasSupported(code));

  useEffect(() => {
    if (!supported || !pickupDate || !dropoffDate || dropoffDate <= pickupDate) {
      setHidden(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setData(null);
    setLoading(true);
    setHidden(false);

    const q = new URLSearchParams({
      iata: code,
      city: cityLabel,
      pickup: pickupDate,
      dropoff: dropoffDate,
    });

    fetch(`/api/car-rentals?${q}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) {
            setData(null);
            setHidden(true);
          }
          return;
        }
        const json = (await res.json()) as Payload;
        if (!cancelled) {
          setData(json);
          setHidden(json.cards.length === 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setHidden(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code, cityLabel, pickupDate, dropoffDate, supported]);

  function scroll(dir: -1 | 1) {
    scrollerRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  }

  /** Travelpayouts Drive DOM’daki href’i GetRentacar’a çevirebiliyor — React state’ten aç. */
  function openAffiliate(url: string, e: MouseEvent) {
    e.preventDefault();
    if (!url || /getrentacar\.com/i.test(url)) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const providerLabel = data?.provider ? PROVIDER_LABEL[data.provider] : "QEEQ";

  function dateHint() {
    if (!data?.pickupDate || !data?.dropoffDate) return null;
    const fmt = (iso: string) => {
      const d = new Date(`${iso}T12:00:00`);
      return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
    };
    const days = data.rentalDays;
    const range = `${fmt(data.pickupDate)} – ${fmt(data.dropoffDate)}`;
    return days && days > 1 ? `${range} · ${days} gün` : range;
  }

  if (hidden && !loading) return null;

  return (
    <section className="affiliate-deals" aria-busy={loading}>
      <div className="affiliate-deals__head">
        <div>
          <h3>{cityLabel} araç kiralama fırsatları</h3>
          <p>
            {data?.datesAdjusted
              ? "Uçuş tarihleri geçmiş; benzer dönem için güncel arama gösteriliyor."
              : data?.location
                ? `${data.location} — ${providerLabel}${data.livePrices ? " · canlı fiyat" : ""}${dateHint() ? ` (${dateHint()})` : ""}`
                : `${providerLabel} araç kiralama`}
          </p>
        </div>
        {data && data.cards.length > 2 ? (
          <div className="affiliate-deals__arrows">
            <button type="button" aria-label="Önceki" onClick={() => scroll(-1)}>
              ‹
            </button>
            <button type="button" aria-label="Sonraki" onClick={() => scroll(1)}>
              ›
            </button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="affiliate-deals__track affiliate-deals__track--loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <article key={i} className="affiliate-card affiliate-card--skeleton" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="affiliate-deals__track" ref={scrollerRef}>
            {data.cards.map((card) => (
              <article key={card.id} className="affiliate-card">
                <a
                  href={card.bookUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="affiliate-card__link"
                  data-affiliate-provider={data.provider ?? "qeeq"}
                  onClick={(e) => openAffiliate(card.bookUrl, e)}
                >
                  <div className="affiliate-card__media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={card.imageUrl} alt="" loading="lazy" />
                  </div>
                  <div className="affiliate-card__body">
                    <p className="affiliate-card__title">{card.name}</p>
                    <p className="affiliate-card__meta">{card.category}</p>
                    <p className="affiliate-card__price">
                      <strong>{card.priceFormatted}</strong>
                    </p>
                    <span className="affiliate-card__cta">İncele →</span>
                  </div>
                </a>
              </article>
            ))}
          </div>
          <p className="affiliate-deals__note">
            <a
              href={data.searchUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
              data-affiliate-provider={data.provider ?? "qeeq"}
              onClick={(e) => openAffiliate(data.searchUrl, e)}
            >
              Tüm araçları gör
            </a>
          </p>
        </>
      ) : null}
    </section>
  );
}
