"use client";

import type { ActivityOfferResult } from "@/lib/affiliate/activities-types";
import { resolveActivityDestIata } from "@/lib/affiliate/activities";
import { tripExtrasSupported } from "@/lib/affiliate/trip-extras";
import { useEffect, useRef, useState } from "react";
export function ActivitiesCarousel({
  cityLabel,
  destIata,
  destinationLabel,
}: {
  cityLabel: string;
  destIata: string;
  /** deal.destination — Google Deals şehir adı eşlemesi için */
  destinationLabel?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ActivityOfferResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);

  const activityDest =
    resolveActivityDestIata(destIata, cityLabel, destinationLabel) ?? "";
  const supported = Boolean(activityDest && tripExtrasSupported(activityDest));

  useEffect(() => {
    if (!supported) {
      setHidden(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setHidden(false);

    const q = new URLSearchParams({ iata: activityDest, city: cityLabel });
    if (destinationLabel?.trim()) {
      q.set("destination", destinationLabel.trim());
    }

    fetch(`/api/activities?${q}`, { cache: "no-store" })      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setHidden(true);
          return;
        }
        const json = (await res.json()) as ActivityOfferResult;
        if (!cancelled) {
          setData(json);
          setHidden(json.cards.length === 0);
        }
      })
      .catch(() => {
        if (!cancelled) setHidden(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activityDest, cityLabel, destinationLabel, supported]);

  function scroll(dir: -1 | 1) {
    scrollerRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  }

  if (hidden && !loading) return null;

  return (
    <section className="affiliate-deals affiliate-deals--activities" aria-busy={loading}>
      <div className="affiliate-deals__head">
        <div>
          <h3>{cityLabel}&apos;de şunları yapabilirsin</h3>
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
                >
                  <div className="affiliate-card__media affiliate-card__media--hotel">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={card.imageUrl} alt="" loading="lazy" />
                  </div>
                  <div className="affiliate-card__body">
                    <p className="affiliate-card__title">{card.name}</p>
                    <p className="affiliate-card__meta">{card.category}</p>
                    <p className="affiliate-card__price">
                      <strong
                        className={
                          card.livePrice ? undefined : "affiliate-card__price--cta"
                        }
                      >
                        {card.priceFormatted}
                      </strong>
                      {card.oldPriceFormatted ? <s>{card.oldPriceFormatted}</s> : null}
                    </p>
                    {typeof card.discountPercent === "number" ? (
                      <p className="affiliate-card__off">%{card.discountPercent} indirim</p>
                    ) : null}
                    <span className="affiliate-card__cta">İncele →</span>
                  </div>
                </a>
              </article>
            ))}
          </div>
          <p className="affiliate-deals__note">
            <a href={data.searchUrl} target="_blank" rel="noopener noreferrer sponsored">
              Tüm aktiviteleri gör
            </a>
          </p>
        </>
      ) : null}
    </section>
  );
}
