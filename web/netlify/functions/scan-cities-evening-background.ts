import { triggerScanSlot } from "../lib/trigger-scan";

/** TR 19:00 = UTC 16:00 — 18 şehir */
export default async () => {
  await triggerScanSlot("cities_evening");
};

export const config = {
  schedule: "0 16 * * *",
};
