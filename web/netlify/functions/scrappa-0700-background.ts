import { runScrappaWindow } from "../lib/trigger-scrappa";
import type { ScrappaCursor } from "../../src/lib/scan/scrappa-oneway-runner";

/** TR 07:00 = UTC 04:00 — 6 ay + yakın 17 gün */
export default async (req?: Request) => {
  let start: ScrappaCursor | undefined;
  try {
    if (req) {
      start = (await req.json()) as ScrappaCursor;
    }
  } catch {
    /* scheduled: boş */
  }
  await runScrappaWindow(
    "full",
    start?.window === "full" ? start : undefined,
    "/.netlify/functions/scrappa-0700-background",
  );
};

export const config = {
  schedule: "0 4 * * *",
};
