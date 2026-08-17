import { startScrappaWindow } from "../lib/trigger-scrappa";

/** TR 15:00 = UTC 12:00 — yakın 17 gün. */
export default async () => {
  await startScrappaWindow("near");
};

export const config = {
  // VPS tarıyor; Netlify Scrappa kapalı
};
