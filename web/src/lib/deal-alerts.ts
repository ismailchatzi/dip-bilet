import {
  dealAbsoluteHref,
  dealDateRange,
  displayDealDiscountPercent,
  displayDealPrice,
  formatDealMoney,
  siteOrigin,
} from "@/lib/deal-display";
import type { Deal } from "@/lib/types";

export function dealKey(deal: Deal): string {
  return [
    deal.destination.trim().toLowerCase(),
    deal.outboundDate ?? "",
    deal.returnDate ?? "",
    String(deal.price),
  ].join("|");
}

function shownMoney(deal: Deal) {
  return formatDealMoney(displayDealPrice(deal.price), deal.currency);
}

export function dealAlertEmailContent(deals: Deal[]) {
  const top = deals.slice(0, 8);
  const subject =
    top.length === 1
      ? `Yeni dip: ${top[0].destination} — ${shownMoney(top[0])}`
      : `${top.length} yeni dip fırsat yakalandı — Dip Bilet`;

  const lines = top.map((d) => {
    const pct = displayDealDiscountPercent(d);
    const discount =
      typeof pct === "number" ? ` (ort. %${pct} altında)` : "";
    const dates = dealDateRange(d);
    const href = dealAbsoluteHref(d);
    return `• ${d.destination}: ${shownMoney(d)}${discount} (${dates})\n  Bileti incele: ${href}`;
  });

  const text = [
    "Merhaba,",
    "",
    "Yeni dip fırsat(lar) yakalandı:",
    "",
    ...lines,
    "",
    "Sevgiler,",
    "Dip Bilet",
  ].join("\n");

  const rows = top
    .map((d) => {
      const pct = displayDealDiscountPercent(d);
      const discount =
        typeof pct === "number"
          ? ` <span style="color:#0a7a4b">ort. %${pct} altında</span>`
          : "";
      const dates = dealDateRange(d);
      const href = dealAbsoluteHref(d);
      return `<li style="margin:0 0 10px"><strong>${d.destination}</strong> — ${shownMoney(d)}${discount}<br/>${dates}<br/><a href="${href}">Bileti incele</a></li>`;
    })
    .join("");

  const html = `
    <div style="font-family:Georgia,serif;line-height:1.6;color:#00153d;max-width:560px">
      <p>Merhaba,</p>
      <p><strong>Yeni dip fırsat(lar) yakalandı.</strong></p>
      <ul style="padding-left:18px">${rows}</ul>
      <p style="margin-top:28px">Sevgiler,<br/>Dip Bilet</p>
    </div>
  `.trim();

  return { subject, text, html };
}

export function dealAlertSmsContent(deals: Deal[]) {
  const top = deals.slice(0, 2);
  const bits = top.map((d) => {
    const name = d.destination.replace(/\s*\([A-Z]{3}\)\s*$/, "").trim();
    return `${name} ${shownMoney(d)}`;
  });
  const extra = deals.length > 2 ? ` +${deals.length - 2}` : "";
  const link =
    deals.length === 1
      ? dealAbsoluteHref(deals[0]).replace(/^https?:\/\//, "")
      : siteOrigin().replace(/^https?:\/\//, "") + "/firsatlarim";
  if (deals.length === 1) {
    return `Dip Bilet: ${bits[0]}. ${link}`;
  }
  return `Dip Bilet: ${deals.length} yeni dip. ${bits.join(", ")}${extra}. ${link}`;
}
