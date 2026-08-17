"use client";

import { DestGallery } from "@/components/vitrin/DestGallery";
import {
  dealCabin,
  dealCityName,
  dealCityTitle,
  dealDateRange,
  dealDateRangeShort,
  dealFoundLabel,
  dealBookingUrl,
  dealDateChoices,
  dealWithDateChoice,
  dealHref,
  otherCityDeals,
  dealDestCode,
  dealOutOrigin,
  dealReturnAirport,
  dealRouteLine,
  dealSourceCipher,
  dealStopsLabel,
  formatDealMoney,
} from "@/lib/deal-display";
import type { Deal } from "@/lib/types";
import Link from "next/link";
import { useMemo, useState } from "react";

export function DealDetail({
  deal,
  cityDeals = [],
}: {
  deal: Deal;
  cityDeals?: Deal[];
}) {
  const [copied, setCopied] = useState(false);
  const [pickedKey, setPickedKey] = useState(
    `${deal.outboundDate ?? ""}|${deal.returnDate ?? ""}`,
  );
  const found = dealFoundLabel(deal);
  const title = dealCityTitle(deal);
  const dest = dealDestCode(deal);
  const choices = dealDateChoices(deal);
  const cityAlts = otherCityDeals(deal, cityDeals);
  const selected =
    choices.find((c) => `${c.outboundDate}|${c.returnDate}` === pickedKey) ??
    choices[0];
  const view = selected ? dealWithDateChoice(deal, selected) : deal;
  const out = dealOutOrigin(view);
  const back = dealReturnAirport(view);
  const bookUrl = dealBookingUrl(view);
  const mark = dealSourceCipher(deal);
  const altRows = useMemo(() => {
    if (choices.length > 1) {
      return choices.map((c) => ({
        key: `${c.outboundDate}|${c.returnDate}`,
        label: dealDateRangeShort(dealWithDateChoice(deal, c)),
        price: formatDealMoney(c.price, deal.currency),
        href: null as string | null,
        choice: c,
      }));
    }
    return cityAlts.map((d) => ({
      key: d.id,
      label: dealDateRangeShort(d),
      price: formatDealMoney(d.price, d.currency),
      href: dealHref(d),
      choice: null,
    }));
  }, [choices, cityAlts, deal]);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${title} — Dip Bilet`, url });
        return;
      }
    } catch {
      /* kopyala */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* yok */
    }
  }

  return (
    <article className="deal-detail">
      <div className="deal-detail__head">
        <div>
          <p className="deal-detail__back">
            <Link href="/firsatlarim">← Vitrine dön</Link>
          </p>
          <h2>{title}</h2>
          <p className="deal-detail__dates">{dealDateRange(view)}</p>
        </div>
        <div className="deal-detail__head-actions">
          <Link href="/hedef-destinasyonlar" className="deal-detail__ghost">
            <HeartIcon />
            Hayal destinasyon
          </Link>
          <button type="button" className="deal-detail__ghost" onClick={() => void share()}>
            <ShareIcon />
            {copied ? "Kopyalandı" : "Paylaş"}
          </button>
        </div>
      </div>

      <DestGallery
        dest={dest || dealCityName(deal)}
        alt={title}
        imageUrl={deal.photoUrl}
      />

      <h3 className="deal-detail__route">{dealRouteLine(view)}</h3>
      {out !== back ? (
        <p className="deal-detail__mix">
          Gidiş {out}, dönüş {back}
          {dest ? ` · ${dest}` : ""}
        </p>
      ) : null}

      <div className="deal-detail__grid">
        <div className="deal-detail__facts">
          <section>
            <h4>Fiyat geçmişi</h4>
            <ul>
              <li>
                <TagIcon />
                <span>Bu fırsat</span>
                <strong>{formatDealMoney(view.price, view.currency)}</strong>
              </li>
              <li>
                <GlobeIcon />
                <span>Standart</span>
                <strong>
                  {typeof deal.averagePrice === "number"
                    ? formatDealMoney(deal.averagePrice, deal.currency)
                    : "—"}
                </strong>
              </li>
              <li>
                <HeartIcon />
                <span>En dip</span>
                <strong>—</strong>
              </li>
              <li>
                <ChartIcon />
                <span>Fiyat Eşiği</span>
                <strong>
                  {typeof deal.thresholdPrice === "number"
                    ? formatDealMoney(deal.thresholdPrice, deal.currency)
                    : "—"}
                </strong>
              </li>
            </ul>
          </section>
          <section>
            <h4>Uçuş detayı</h4>
            <ul>
              <li>
                <PlaneIcon />
                <span>Havayolu</span>
                <strong>{view.airline || "—"}</strong>
              </li>
              <li>
                <PathIcon />
                <span>Aktarma</span>
                <strong>{dealStopsLabel(deal)}</strong>
              </li>
              <li>
                <SeatIcon />
                <span>Sınıf</span>
                <strong>{dealCabin()}</strong>
              </li>
              <li>
                <ClockIcon />
                <span>Tarihler</span>
                <strong>{dealDateRangeShort(view)}</strong>
              </li>
              {found ? (
                <li>
                  <ClockIcon />
                  <span>Fırsat tarihi</span>
                  <strong>{found}</strong>
                </li>
              ) : null}
            </ul>
          </section>
        </div>

        <aside className="deal-detail__buy">
          <p className="deal-detail__from">
            {formatDealMoney(view.price, view.currency)}
            {typeof view.averagePrice === "number" ? (
              <s>{formatDealMoney(view.averagePrice, view.currency)}</s>
            ) : null}
          </p>
          {typeof view.discountPercent === "number" ? (
            <p className="deal-detail__saved">%{view.discountPercent} tasarruf</p>
          ) : null}
          {mark ? (
            <span className="deal-detail__mark" aria-hidden="true">
              {mark}
            </span>
          ) : null}
          {bookUrl ? (
            <a
              className="deal-detail__book"
              href={bookUrl}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              Bileti incele
            </a>
          ) : (
            <span className="deal-detail__book deal-detail__book--disabled">
              Link yok
            </span>
          )}
          <button type="button" className="deal-detail__alt" onClick={() => void share()}>
            Fırsatı paylaş
          </button>
        </aside>
      </div>

      {altRows.length > 0 ? (
        <section className="deal-alts">
          <h3>Farklı Tarihli Dip Fiyatlar</h3>
          <ul>
            {altRows.map((row) => (
              <li key={row.key}>
                {row.href ? (
                  <Link href={row.href}>
                    <span>{row.label}</span>
                    <strong>{row.price}</strong>
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={
                      pickedKey === row.key
                        ? "deal-alts__pick deal-alts__pick--on"
                        : "deal-alts__pick"
                    }
                    onClick={() => row.choice && setPickedKey(row.key)}
                  >
                    <span>{row.label}</span>
                    <strong>{row.price}</strong>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 21s-6.7-4.35-9.33-8.4C.8 9.7 1.7 6 4.8 5.1c1.8-.5 3.6.3 4.6 1.8 1-1.5 2.8-2.3 4.6-1.8 3.1.9 4 4.6 2.13 7.5C18.7 16.65 12 21 12 21z"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .17 1L8.8 8.4a3 3 0 1 0 0 7.2l6.37 3.4A3 3 0 1 0 16 17.2l-6.37-3.4a3.1 3.1 0 0 0 0-3.6L16 6.8A3 3 0 0 0 18 8z"
      />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .6 1.4l9 9a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8zM7 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
      />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.4 9h-3.2a15 15 0 0 0-1.3-6.1A8 8 0 0 1 19.4 11zM12 4c.9 0 2.3 2.2 2.8 6H9.2C9.7 6.2 11.1 4 12 4zM4.6 13h3.2a15 15 0 0 0 1.3 6.1A8 8 0 0 1 4.6 13zm3.2-2H4.6A8 8 0 0 1 9.1 4.9 15 15 0 0 0 7.8 11zM12 20c-.9 0-2.3-2.2-2.8-6h5.6c-.5 3.8-1.9 6-2.8 6zm2.9-.9A15 15 0 0 0 16.2 13h3.2a8 8 0 0 1-4.5 6.1z"
      />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 9h3v11H5zm6-6h3v17h-3zm6 9h3v8h-3z"
      />
    </svg>
  );
}

function PlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"
      />
    </svg>
  );
}

function PathIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17 16a3 3 0 1 1-2.83 4H4v-2h10.17A3 3 0 0 1 17 16zM7 4a3 3 0 1 1 2.83 4H20v2H9.83A3 3 0 0 1 7 4z"
      />
    </svg>
  );
}

function SeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 13V5a3 3 0 0 1 6 0v8h5v2H7v-2zm-2 5h14v2H5z"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 11H7V11h4V6h2z"
      />
    </svg>
  );
}
