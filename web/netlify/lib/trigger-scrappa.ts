type ScrappaWindow = "full" | "near";

const SLICE_MS = 8 * 60 * 1000;
const MAX_BATCHES = 50;
const TICK_PATH = "/.netlify/functions/scrappa-tick-background";

function siteBase() {
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).replace(/\/$/, "");
}

async function postApi(path: string, body: object) {
  const base = siteBase();
  const secret = process.env.CRON_SECRET?.trim();
  if (!base || !secret) {
    console.error("URL veya CRON_SECRET eksik");
    return null;
  }
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(path, res.status, text.slice(0, 1500));
  if (!res.ok) return null;
  try {
    return JSON.parse(text) as {
      ok?: boolean;
      running?: boolean;
      paused?: boolean;
    };
  } catch {
    return { ok: res.ok };
  }
}

async function kickTick() {
  const base = siteBase();
  const secret = process.env.CRON_SECRET?.trim();
  if (!base || !secret) return;
  try {
    const res = await fetch(`${base}${TICK_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ force: true }),
    });
    console.log("scrappa tick kick", res.status);
  } catch (err) {
    console.error("scrappa tick kick fail", err);
  }
}

export async function startScrappaWindow(window: ScrappaWindow) {
  const started = await postApi("/api/cron/scrappa-start", { window });
  if (!started?.ok) return;
  await kickTick();
}

export async function runScrappaTick(force = false) {
  const deadline = Date.now() + SLICE_MS;
  let batches = 0;
  let running = true;
  while (Date.now() < deadline && batches < MAX_BATCHES) {
    const result = await postApi("/api/cron/scrappa-tick", {
      force: batches === 0 ? force : true,
    });
    batches += 1;
    if (!result) break;
    if (result.paused) {
      running = false;
      break;
    }
    if (result.running === false) {
      running = false;
      break;
    }
  }
  if (running) await kickTick();
}
