import { promises as fs } from "fs";
import path from "path";
import { cacheFile } from "@/lib/cache-path";
import { routeKey } from "@/lib/scan/dates";

const FILE = cacheFile("route-baselines.json");

export type RouteBaseline = {
  destinationCode: string;
  averagePrice: number;
  source: string;
  updatedAt: string;
};

type Store = Record<string, RouteBaseline>;

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

async function writeStore(store: Store): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), "utf8");
}

/** Google typical ortalamayı cache’le (Scrappa vb. için) */
export async function upsertRouteBaseline(
  destinationCode: string,
  averagePrice: number,
  source: string,
): Promise<void> {
  if (!destinationCode || !(averagePrice > 0)) return;
  const code = destinationCode.toUpperCase();
  const store = await readStore();
  store[code] = {
    destinationCode: code,
    averagePrice,
    source,
    updatedAt: new Date().toISOString(),
  };
  await writeStore(store);
}

/** Max ageHours içindeki Google baseline */
export async function getRouteBaseline(
  destinationCode: string,
  maxAgeHours = 24 * 14,
): Promise<number | null> {
  const store = await readStore();
  const row = store[destinationCode.toUpperCase()];
  if (!row?.averagePrice) return null;
  const ageMs = Date.now() - new Date(row.updatedAt).getTime();
  if (Number.isNaN(ageMs) || ageMs > maxAgeHours * 60 * 60 * 1000) return null;
  return row.averagePrice;
}

export function baselineRouteKey(destinationCode: string) {
  return routeKey(destinationCode);
}
