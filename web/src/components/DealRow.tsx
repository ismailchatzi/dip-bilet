import type { Deal } from "@/lib/types";

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

function formatDate(iso?: string) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function DealRow({
  deal,
  mode = "archive",
}: {
  deal: Deal;
  mode?: "archive" | "live";
}) {
  const dates = [formatDate(deal.outboundDate), formatDate(deal.returnDate)]
    .filter(Boolean)
    .join(" → ");

  const isArchive = mode === "archive";

  return (
    <article
      className={isArchive ? "deal-row deal-row--archive" : "deal-row"}
    >
      <div className="deal-row__main">
        <p className="deal-row__route">
          <span>{deal.departureLabel}</span>
          <span className="deal-row__arrow" aria-hidden>
            →
          </span>
          <strong>{deal.destination}</strong>
          {deal.country ? (
            <span className="deal-row__country">{deal.country}</span>
          ) : null}
        </p>
        <p className="deal-row__meta">
          {dates || "Esnek tarihler"}
          {deal.airline ? ` · ${deal.airline}` : ""}
          {typeof deal.stops === "number"
            ? deal.stops === 0
              ? " · Direkt"
              : ` · ${deal.stops} aktarma`
            : ""}
        </p>
      </div>

      <div className="deal-row__pricing">
        {typeof deal.discountPercent === "number" ? (
          <span className="deal-row__badge">
            ortalamanın %{deal.discountPercent} altında!
          </span>
        ) : null}
        <p className="deal-row__price">
          {formatMoney(deal.price, deal.currency)}
        </p>
        {typeof deal.averagePrice === "number" ? (
          <p className="deal-row__avg">
            ort. {formatMoney(deal.averagePrice, deal.currency)}
          </p>
        ) : null}
      </div>

      {isArchive ? (
        <span className="deal-row__stamp">Süresi doldu</span>
      ) : deal.googleFlightsUrl ? (
        <a
          className="deal-row__cta"
          href={deal.googleFlightsUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          İncele
        </a>
      ) : (
        <span className="deal-row__stamp">Link yok</span>
      )}
    </article>
  );
}
