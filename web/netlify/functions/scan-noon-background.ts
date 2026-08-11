import { triggerScanSlot } from "../lib/trigger-scan";

/** TR 10:00 = UTC 07:00 — Deals */
export default async () => {
  await triggerScanSlot("noon");
};

export const config = {
  schedule: "0 7 * * *",
};
