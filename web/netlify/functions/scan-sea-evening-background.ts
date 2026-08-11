import { triggerScanSlot } from "../lib/trigger-scan";

/** TR 20:00 = UTC 17:00 — SEA #2 */
export default async () => {
  await triggerScanSlot("sea_evening");
};

export const config = {
  schedule: "0 17 * * *",
};
