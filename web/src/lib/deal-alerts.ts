import {
  dealAbsoluteHref,
  dealCityKey,
  dealCityTitle,
  dealDateRange,
  dealDestCode,
  displayDealDiscountPercent,
  displayDealPrice,
  formatDealMoney,
  siteOrigin,
} from "@/lib/deal-display";
import { destPhotoCode } from "@/lib/destination-photos";
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

function cardPhotoUrl(deal: Deal): string | null {
  const origin = siteOrigin();
  // Önce Google Deals thumbnail
  if (deal.photoUrl) return deal.photoUrl;
  // Yerel fotoğraf
  const code =
    destPhotoCode(dealCityKey(deal)) ?? destPhotoCode(dealDestCode(deal));
  if (!code) return null;
  return `${origin}/destinations/card/${code.toLowerCase()}1.jpg`;
}

function dealCard(deal: Deal, origin: string): string {
  const title = dealCityTitle(deal);
  const money = shownMoney(deal);
  const pct = displayDealDiscountPercent(deal);
  const dates = dealDateRange(deal);
  const href = dealAbsoluteHref(deal);
  const photo = cardPhotoUrl(deal);
  const discount =
    typeof pct === "number"
      ? `<span style="display:inline-block;background:#e6f7ee;color:#0a7a4b;font-size:13px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:8px">%${pct} indirim</span>`
      : "";
  const imgBlock = photo
    ? `<a href="${href}" style="display:block;text-decoration:none"><img src="${photo}" alt="${title}" width="560" style="display:block;width:100%;max-width:560px;height:200px;object-fit:cover;border-radius:10px 10px 0 0;border:0"/></a>`
    : "";
  const avg = deal.averagePrice
    ? `<span style="color:#888;text-decoration:line-through;font-size:15px;margin-left:8px">${formatDealMoney(deal.averagePrice, deal.currency)}</span>`
    : "";

  return `
<table width="560" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;border-radius:12px;overflow:hidden;border:1.5px solid #e8e8e8;font-family:'Segoe UI',system-ui,sans-serif">
  <tr><td style="padding:0">${imgBlock}</td></tr>
  <tr>
    <td style="padding:18px 20px 20px;background:#fff">
      <p style="margin:0 0 4px;font-size:20px;font-weight:800;color:#00153d">${title}${discount}</p>
      <p style="margin:0 0 12px;font-size:13px;color:#888">${dates} &nbsp;·&nbsp; İstanbul kalkışlı</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td style="vertical-align:middle">
          <span style="font-size:28px;font-weight:900;color:#111">${money}</span>${avg}
        </td>
        <td align="right" style="vertical-align:middle">
          <a href="${href}" style="display:inline-block;background:#00153d;color:#fff;font-size:14px;font-weight:700;padding:10px 22px;border-radius:8px;text-decoration:none">Bileti incele →</a>
        </td>
      </tr></table>
    </td>
  </tr>
</table>`.trim();
}

export function dealAlertEmailContent(deals: Deal[]) {
  const top = deals.slice(0, 6);
  const origin = siteOrigin();

  const subject =
    top.length === 1
      ? `✈ ${dealCityTitle(top[0])} — ${shownMoney(top[0])}`
      : `✈ ${top.length} yeni dip fırsat — Dip Bilet`;

  /* ----- düz metin (fallback) ----- */
  const lines = top.map((d) => {
    const pct = displayDealDiscountPercent(d);
    const discount = typeof pct === "number" ? ` (%${pct} altında)` : "";
    return `• ${dealCityTitle(d)}: ${shownMoney(d)}${discount} — ${dealDateRange(d)}\n  ${dealAbsoluteHref(d)}`;
  });
  const text = [
    "Merhaba,",
    "",
    "Yeni dip fırsat(lar) yakalandı:",
    "",
    ...lines,
    "",
    "Sevgiler,",
    "Dip Bilet — " + origin,
  ].join("\n");

  /* ----- HTML ----- */
  const cards = top.map((d) => dealCard(d, origin)).join("\n");

  const html = `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:'Segoe UI',system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f6fa;padding:32px 0">
<tr><td align="center">

  <!-- Logo + başlık -->
  <table width="560" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px">
    <tr>
      <td style="padding:0 0 16px">
        <a href="${origin}" style="text-decoration:none">
          <img src="${origin}/logo-db-badge.png" alt="Dip Bilet" height="36" style="height:36px;border:0">
        </a>
      </td>
    </tr>
    <tr>
      <td style="font-size:26px;font-weight:900;color:#00153d;letter-spacing:-0.5px">
        ✈ Yeni dip fırsat${top.length > 1 ? "lar" : ""} yakalandı
      </td>
    </tr>
    <tr>
      <td style="font-size:14px;color:#555;padding-top:6px">
        İstanbul kalkışlı, eşiğin altında biletler sizi bekliyor.
      </td>
    </tr>
  </table>

  <!-- Fırsat kartları -->
  ${cards}

  <!-- Footer -->
  <table width="560" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;padding:24px 0 0;border-top:1px solid #e0e0e0;text-align:center">
    <tr>
      <td style="font-size:12px;color:#aaa;line-height:1.6">
        Dip Bilet &nbsp;·&nbsp; <a href="${origin}/firsatlarim" style="color:#00153d;text-decoration:none">Vitrine git</a><br>
        Bu bildirimi almak istemiyorsan <a href="${origin}/hesap-ayarlari" style="color:#00153d;text-decoration:none">bildirim ayarlarından</a> kapatabilirsin.
      </td>
    </tr>
  </table>

</td></tr>
</table>
</body>
</html>`.trim();

  return { subject, text, html };
}

export function dealAlertSmsContent(deals: Deal[]) {
  const top = deals.slice(0, 2);
  const bits = top.map((d) => {
    const name = dealCityTitle(d).replace(/,.*$/, "").trim();
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
