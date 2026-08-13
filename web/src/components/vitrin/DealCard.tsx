import { DestPhoto } from "@/components/vitrin/DestPhoto";
import {
  dealCabin,
  dealCityName,
  dealCityTitle,
  dealDestCode,
  dealFoundLabel,
  dealHref,
  dealOutOrigin,
  formatDealMoney,
} from "@/lib/deal-display";
import type { Deal } from "@/lib/types";
import Link from "next/link";

export function DealCard({ deal }: { deal: Deal }) {
  const dest = dealDestCode(deal) || dealCityName(deal);
  const found = dealFoundLabel(deal);
  return (
    <Link href={dealHref(deal)} className="vitrin-card">
      <DestPhoto dest={dest} alt={dealCityTitle(deal)} className="vitrin-card__photo" />
      <div className="vitrin-card__body">
        <h3 className="vitrin-card__title">{dealCityTitle(deal)}</h3>
        <p className="vitrin-card__prices">
          <strong>{formatDealMoney(deal.price, deal.currency)}</strong>
          {typeof deal.averagePrice === "number" ? (
            <s>{formatDealMoney(deal.averagePrice, deal.currency)}</s>
          ) : null}
        </p>
        <div className="vitrin-card__meta">
          <span>
            <PlaneIcon />
            {dealOutOrigin(deal)}
          </span>
          <span>
            <SeatIcon />
            {dealCabin()}
          </span>
        </div>
        {found ? <p className="vitrin-card__found">{found}</p> : null}
      </div>
    </Link>
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
