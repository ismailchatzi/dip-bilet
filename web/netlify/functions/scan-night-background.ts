import { triggerScanSlot } from "../lib/trigger-scan";

/** TR 03:00 = UTC 00:00 — Deals */
export default async () => {
  await triggerScanSlot("night");
};

export const config = {
  schedule: "0 0 * * *",
};
