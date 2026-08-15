/**
 * Google Deals — TR: 01, 03, 07, 12, 14, 17, 19, 22
 * UTC: 22, 00, 04, 09, 11, 14, 16, 19
 */
function siteBase() {
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/$/, "");
}

export default async () => {
  const base = siteBase();
  const secret = process.env.CRON_SECRET?.trim();
  if (!base || !secret) {
    console.error("URL veya CRON_SECRET eksik");
    return;
  }

  const res = await fetch(`${base}/api/cron/serpapi-deals`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await res.text();
  console.log("serpapi-deals", res.status, text.slice(0, 2000));
};

export const config = {
  schedule: "0 0,4,9,11,14,16,19,22 * * *",
};
