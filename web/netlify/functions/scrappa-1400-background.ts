import { runScrappaWindow } from "../lib/trigger-scrappa";
import type { ScrappaCursor } from "../../src/lib/scan/scrappa-oneway-runner";

/** TR 14:00 = UTC 11:00 — sadece yakın 17 gün */
export default async (req?: Request) => {
  let start: ScrappaCursor | undefined;
  try {
    if (req) {
      start = (await req.json()) as ScrappaCursor;
    }
  } catch {
    /* scheduled */
  }
  await runScrappaWindow(
    "near",
    start?.window === "near" ? start : undefined,
    "/.netlify/functions/scrappa-1400-background",
  );
};

export const config = {
  schedule: "0 11 * * *",
};
