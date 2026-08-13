import type { ScrappaCursor } from "../../src/lib/scan/scrappa-oneway-runner";
import type { ScrappaWindow } from "../../src/lib/scan/scrappa-horizon";

function siteBase() {
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/$/, "");
}

async function postBatch(cursor: ScrappaCursor) {
  const base = siteBase();
  const secret = process.env.CRON_SECRET?.trim();
  if (!base || !secret) {
    console.error("URL veya CRON_SECRET eksik");
    return null;
  }
  const res = await fetch(`${base}/api/cron/scrappa-oneway`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cursor),
  });
  const text = await res.text();
  console.log("scrappa batch", res.status, text.slice(0, 2000));
  if (!res.ok) return null;
  try {
    return JSON.parse(text) as {
      done: boolean;
      next: ScrappaCursor | null;
      dest?: string;
      scanned: number;
      saved: number;
    };
  } catch {
    return null;
  }
}

/** 15 dk background içinde batch zinciri; süre dolarsa kendini tekrar çağırır */
export async function runScrappaWindow(
  window: ScrappaWindow,
  start?: ScrappaCursor,
  continuePath?: string,
) {
  let cursor: ScrappaCursor = start ?? {
    window,
    destIndex: 0,
    dateIndex: 0,
  };
  const deadline = Date.now() + 12 * 60 * 1000;

  while (Date.now() < deadline) {
    const result = await postBatch(cursor);
    if (!result) break;
    if (result.done || !result.next) {
      console.log("scrappa window bitti", window);
      return;
    }
    cursor = result.next;
  }

  if (continuePath) {
    const base = siteBase();
    const url = `${base}${continuePath}`;
    console.log("scrappa continue", url, cursor);
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cursor),
    }).catch((err) => console.error("continue fail", err));
  }
}
