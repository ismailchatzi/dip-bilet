import { startScrappaWindow } from "../lib/trigger-scrappa";

/** TR 22:00 = UTC 19:00 — yakın 17 gün. */
export default async () => {
  await startScrappaWindow("near");
};

export const config = {
  // schedule kapalı (askı)
};
