import type { Deal } from "@/lib/types";

export function dealKey(deal: Deal): string {
  return [
    deal.destination.trim().toLowerCase(),
    deal.outboundDate ?? "",
    deal.returnDate ?? "",
    String(deal.price),
  ].join("|");
}

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

export function dealAlertEmailContent(deals: Deal[], panelUrl: string) {
  const top = deals.slice(0, 8);
  const subject =
    top.length === 1
      ? `Yeni dip: ${top[0].destination} — ${formatMoney(top[0].price, top[0].currency)}`
      : `${top.length} yeni dip fırsat yakalandı — Dip Bilet`;

  const lines = top.map((d) => {
    const discount =
      typeof d.discountPercent === "number"
        ? ` (ort. %${d.discountPercent} altında)`
        : "";
    return `• ${d.departureLabel} → ${d.destination}: ${formatMoney(d.price, d.currency)}${discount}`;
  });

  const text = [
    "Merhaba,",
    "",
    "Yeni dip fırsat(lar) yakalandı:",
    "",
    ...lines,
    "",
    `Panele git: ${panelUrl}`,
    "",
    "Sevgiler,",
    "Dip Bilet",
  ].join("\n");

  const rows = top
    .map((d) => {
      const discount =
        typeof d.discountPercent === "number"
          ? ` <span style="color:#0a7a4b">ort. %${d.discountPercent} altında</span>`
          : "";
      const link = d.googleFlightsUrl
        ? ` <a href="${d.googleFlightsUrl}">İncele</a>`
        : "";
      return `<li style="margin:0 0 10px"><strong>${d.destination}</strong> — ${formatMoney(d.price, d.currency)}${discount}${link}</li>`;
    })
    .join("");

  const html = `
    <div style="font-family:Georgia,serif;line-height:1.6;color:#00153d;max-width:560px">
      <p>Merhaba,</p>
      <p><strong>Yeni dip fırsat(lar) yakalandı.</strong></p>
      <ul style="padding-left:18px">${rows}</ul>
      <p><a href="${panelUrl}">Panele git</a></p>
      <p style="margin-top:28px">Sevgiler,<br/>Dip Bilet</p>
    </div>
  `.trim();

  return { subject, text, html };
}
