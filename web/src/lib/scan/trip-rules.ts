const LONG_HAUL = new Set(["DPS", "HKT", "MLE"]);

export function stayRange(code: string): [number, number] {
  return LONG_HAUL.has(code) ? [7, 10] : [4, 10];
}

export function nightsBetween(out: string, back: string) {
  const a = Date.parse(`${out}T12:00:00Z`);
  const b = Date.parse(`${back}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return -1;
  return Math.round((b - a) / 86_400_000);
}

/** TR tarihi (UTC+3, yaz/kış yok) */
export function turkeyTodayIso(now = new Date()) {
  const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return tr.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number) {
  const t = Date.parse(`${iso}T12:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}
