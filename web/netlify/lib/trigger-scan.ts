/** Ortak: Netlify scheduled function → Next cron API */
export async function triggerScanSlot(slot: string) {
  const base = (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/$/, "");
  const secret = process.env.CRON_SECRET?.trim();

  if (!base || !secret) {
    console.error("URL veya CRON_SECRET eksik", {
      hasBase: !!base,
      hasSecret: !!secret,
    });
    return;
  }

  const url = `${base}/api/cron/scan-deals?slot=${encodeURIComponent(slot)}`;
  console.log("cron tetik", slot, url);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ slot }),
  });

  const text = await res.text();
  console.log("cron sonuç", slot, res.status, text.slice(0, 4000));
}
