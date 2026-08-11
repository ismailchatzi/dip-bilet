import { promises as fs } from "fs";
import path from "path";
import { cacheFile } from "./cache-path";
import type { DealsPayload } from "./types";

const CACHE_FILE = cacheFile("deals.json");

export async function readDealsCache(
  maxAgeHours: number,
): Promise<DealsPayload | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const data = JSON.parse(raw) as DealsPayload;
    const ageMs = Date.now() - new Date(data.fetchedAt).getTime();
    const maxMs = maxAgeHours * 60 * 60 * 1000;
    if (Number.isNaN(ageMs) || ageMs > maxMs) return null;
    return { ...data, source: "cache" };
  } catch {
    return null;
  }
}

export async function writeDealsCache(payload: DealsPayload): Promise<void> {
  const dir = path.dirname(CACHE_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload, null, 2), "utf8");
}
