import { triggerScanSlot } from "../lib/trigger-scan";

/** TR 18:00 = UTC 15:00 — Deals */
export default async () => {
  await triggerScanSlot("evening");
};

export const config = {
  schedule: "0 15 * * *",
};
