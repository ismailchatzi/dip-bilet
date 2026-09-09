export type ScrappaLane = "a" | "b";

export function currentLane(): ScrappaLane {
  return process.env.SCRAPPA_LANE === "b" ? "b" : "a";
}

export function parseLane(raw: string | undefined): ScrappaLane | null {
  if (raw === "a" || raw === "b") return raw;
  return null;
}

/** Süreç kendi anahtarını kullanır. B yoksa A'nın anahtarına düşmez. */
export function bindLaneApiKey(lane: ScrappaLane): { ok: true } | { ok: false; error: string } {
  process.env.SCRAPPA_LANE = lane;
  if (lane === "a") {
    const key = process.env.SCRAPPA_API_KEY?.trim();
    if (!key) return { ok: false, error: "SCRAPPA_API_KEY yok" };
    return { ok: true };
  }
  const key = process.env.SCRAPPA_API_KEY_B?.trim();
  if (!key) return { ok: false, error: "SCRAPPA_API_KEY_B yok" };
  process.env.SCRAPPA_API_KEY = key;
  return { ok: true };
}
