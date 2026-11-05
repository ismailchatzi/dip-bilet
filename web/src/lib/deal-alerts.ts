import {
  cheapestDealPerCity,
  dealAbsoluteHref,
  dealCityKey,
  dealCityTitle,
  dealDestCode,
  displayDealDiscountPercent,
  displayDealPrice,
  formatDealMoney,
  siteOrigin,
} from "@/lib/deal-display";
import { hostedMailPhotoPath } from "@/lib/destination-photos";
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

/** Mail istemcileri localhost görseli yükleyemez — fotoğraf için prod (veya EMAIL_ASSET_ORIGIN). */
function emailAssetOrigin() {
  const raw =
    process.env.EMAIL_ASSET_ORIGIN?.trim() ||
    "https://dipbilet.com";
  return raw.replace(/\/$/, "");
}

function absoluteEmailAsset(pathOrUrl: string) {
  const raw = pathOrUrl.trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = emailAssetOrigin();
  return `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cardPhotoUrl(deal: Deal): string {
  const codeOrName = dealCityKey(deal) || dealDestCode(deal) || deal.destination;
  return absoluteEmailAsset(hostedMailPhotoPath(codeOrName || "fallback"));
}

function dealCard(deal: Deal): string {
  const title = dealCityTitle(deal);
  const money = shownMoney(deal);
  const pct = displayDealDiscountPercent(deal);
  const href = escapeHtml(dealAbsoluteHref(deal));
  const photo = escapeHtml(cardPhotoUrl(deal));
  const safeTitle = escapeHtml(title);
  const discount =
    typeof pct === "number"
      ? `<span style="display:inline-block;background:#e6f7ee;color:#0a7a4b;font-size:13px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:8px">%${pct} daha ucuz</span>`
      : "";
  const imgBlock = photo
    ? `<a href="${href}" style="display:block;text-decoration:none"><img src="${photo}" alt="${safeTitle}" width="560" height="200" style="display:block;width:100%;max-width:560px;height:200px;border:0"/></a>`
    : "";
  const avg = deal.averagePrice
    ? `<span style="color:#888;text-decoration:line-through;font-size:15px;margin-left:8px">${formatDealMoney(deal.averagePrice, deal.currency)}</span>`
    : "";

  return `
<table width="560" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;border-radius:12px;overflow:hidden;border:1.5px solid #e8e8e8;font-family:'Segoe UI',system-ui,sans-serif">
  <tr><td style="padding:0">${imgBlock}</td></tr>
  <tr>
    <td style="padding:18px 20px 20px;background:#fff">
      <p style="margin:0 0 8px;font-size:26px;font-weight:900;color:#00153d;letter-spacing:-0.5px">Sadece Dip Bilet'te;</p>
      <p style="margin:0 0 12px;font-size:20px;font-weight:800;color:#00153d">${safeTitle}${discount}</p>
      <p style="margin:0 0 16px">
        <span style="font-size:28px;font-weight:900;color:#111">${money}</span>${avg}
      </p>
      <p style="margin:0 0 6px;font-size:13px;color:#555;line-height:1.45;font-weight:600">
        Fiyatlar hızlı şekilde değişebilir, acele et.
      </p>
      <p style="margin:0 0 10px;font-size:13px;color:#555;line-height:1.45">
        Bu bileti ve diğer tarihli fırsatları görüntülemek için;
      </p>
      <a href="${href}" style="display:inline-block;background:#00153d;color:#fff;font-size:14px;font-weight:700;padding:10px 22px;border-radius:8px;text-decoration:none">Bileti incele →</a>
    </td>
  </tr>
</table>`.trim();
}

/** Şehir başına yalnızca en ucuz fırsat (spam hissi olmasın). */
function pickEmailDeals(deals: Deal[]) {
  return cheapestDealPerCity(deals)
    .sort(
      (a, b) =>
        displayDealPrice(a.price) - displayDealPrice(b.price),
    )
    .slice(0, 6);
}

export function dealAlertEmailContent(deals: Deal[]) {
  const top = pickEmailDeals(deals);
  const origin = siteOrigin();

  const subject =
    top.length === 1
      ? `✈ ${dealCityTitle(top[0])} — ${shownMoney(top[0]!)}`
      : `✈ ${top.length} yeni dip fırsat — Dip Bilet`;

  /* ----- düz metin (fallback) ----- */
  const lines = top.map((d) => {
    const pct = displayDealDiscountPercent(d);
    const discount =
      typeof pct === "number" ? `, normal fiyatından %${pct} daha ucuz` : "";
    return `• ${dealCityTitle(d)}: ${shownMoney(d)}${discount}\n  ${dealAbsoluteHref(d)}`;
  });
  const text = [
    "Merhaba,",
    "",
    "Takip ettiğin bölgeden yeni dip fırsat yakalandı!",
    "",
    ...lines,
    "",
    "Fiyatlar hızlı şekilde değişebilir, acele et.",
    "Bu bileti ve diğer tarihli fırsatları görüntülemek için vitrine git.",
    "",
    "Sevgiler,",
    "Dip Bilet — " + origin,
  ].join("\n");

  /* ----- HTML ----- */
  const cards = top.map((d) => dealCard(d)).join("\n");
  const headline =
    top.length > 1
      ? "✈ Takip ettiğin bölgelerden yeni dip fırsatlar yakalandı!"
      : "✈ Takip ettiğin bölgeden yeni dip fırsat yakalandı!";

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
          <img src="${absoluteEmailAsset("/logo-db-badge.png")}" alt="Dip Bilet" height="36" style="height:36px;border:0">
        </a>
      </td>
    </tr>
    <tr>
      <td style="font-size:26px;font-weight:900;color:#00153d;letter-spacing:-0.5px">
        ${headline}
      </td>
    </tr>
  </table>

  <!-- Fırsat kartları (şehir başına en ucuz) -->
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

/** Üyenin kurduğu fiyat alarmı tuttu: tek fırsat. */
export function priceAlertEmailContent(deal: Deal, alertText: string) {
  const origin = siteOrigin();
  const subject = `🔔 Fiyat alarmın: ${dealCityTitle(deal)} — ${shownMoney(deal)}`;
  const pct = displayDealDiscountPercent(deal);
  const discount =
    typeof pct === "number" ? `, normal fiyatından %${pct} daha ucuz` : "";
  const text = [
    "Merhaba,",
    "",
    `Kurduğun fiyat alarmı tuttu (${alertText}):`,
    "",
    `• ${dealCityTitle(deal)}: ${shownMoney(deal)}${discount}`,
    `  ${dealAbsoluteHref(deal)}`,
    "",
    `Alarmlarını yönetmek için: ${origin}/ucus-ayarlari`,
    "",
    "Sevgiler,",
    "Dip Bilet — " + origin,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:'Segoe UI',system-ui,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f6fa;padding:32px 0">
<tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px">
    <tr>
      <td style="padding:0 0 16px">
        <a href="${origin}" style="text-decoration:none">
          <img src="${absoluteEmailAsset("/logo-db-badge.png")}" alt="Dip Bilet" height="36" style="height:36px;border:0">
        </a>
      </td>
    </tr>
    <tr>
      <td style="font-size:26px;font-weight:900;color:#00153d;letter-spacing:-0.5px">🔔 Fiyat alarmın tuttu</td>
    </tr>
    <tr>
      <td style="font-size:14px;color:#555;padding-top:6px">${alertText}</td>
    </tr>
  </table>
  ${dealCard(deal)}
  <table width="560" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;padding:24px 0 0;border-top:1px solid #e0e0e0;text-align:center">
    <tr>
      <td style="font-size:12px;color:#aaa;line-height:1.6">
        Dip Bilet &nbsp;·&nbsp; <a href="${origin}/firsatlarim" style="color:#00153d;text-decoration:none">Vitrine git</a><br>
        Alarmı kaldırmak için <a href="${origin}/ucus-ayarlari" style="color:#00153d;text-decoration:none">uçuş ayarlarına</a> git.
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
  const cities = pickEmailDeals(deals);
  const top = cities.slice(0, 2);
  const link =
    cities.length === 1
      ? dealAbsoluteHref(cities[0]!).replace(/^https?:\/\//, "")
      : siteOrigin().replace(/^https?:\/\//, "") + "/firsatlarim";

  if (cities.length === 1) {
    const d = cities[0]!;
    const name = dealCityTitle(d).replace(/,.*$/, "").trim();
    const pct = displayDealDiscountPercent(d);
    const pctBit =
      typeof pct === "number" ? `, normal fiyatından %${pct} daha ucuz` : "";
    return `Sadece Dip Bilet'te ve sana özel: ${name} ${shownMoney(d)}${pctBit}!! Fiyatlar değişebilir hemen siteyi ziyaret et: ${link}`;
  }

  const bits = top.map((d) => {
    const name = dealCityTitle(d).replace(/,.*$/, "").trim();
    const pct = displayDealDiscountPercent(d);
    const pctBit = typeof pct === "number" ? ` (%${pct} daha ucuz)` : "";
    return `${name} ${shownMoney(d)}${pctBit}`;
  });
  const extra = cities.length > 2 ? ` +${cities.length - 2}` : "";
  return `Sadece Dip Bilet'te ve sana özel: ${cities.length} yeni dip. ${bits.join(", ")}${extra}!! Fiyatlar değişebilir hemen siteyi ziyaret et: ${link}`;
}
