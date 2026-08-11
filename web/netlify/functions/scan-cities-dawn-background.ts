import { triggerScanSlot } from "../lib/trigger-scan";

/** TR 04:00 = UTC 01:00 — 18 şehir */
export default async () => {
  await triggerScanSlot("cities_dawn");
};

export const config = {
  schedule: "0 1 * * *",
};
