import { triggerScanSlot } from "../lib/trigger-scan";

/** TR 12:00 = UTC 09:00 — SEA #1 */
export default async () => {
  await triggerScanSlot("sea_noon");
};

export const config = {
  schedule: "0 9 * * *",
};
