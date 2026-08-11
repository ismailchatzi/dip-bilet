import { triggerScanSlot } from "../lib/trigger-scan";

/** TR 05:00 = UTC 02:00 — Deals + SEA #0 */
export default async () => {
  await triggerScanSlot("morning");
};

export const config = {
  schedule: "0 2 * * *",
};
