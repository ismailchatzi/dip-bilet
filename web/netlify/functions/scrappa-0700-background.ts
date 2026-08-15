import { startScrappaWindow } from "../lib/trigger-scrappa";

/** TR 07:00 = UTC 04:00 — tam tarama kuyruğa girer, dilim dilim biter. */
export default async () => {
  await startScrappaWindow("full");
};

export const config = {
  // VPS tarıyor; Netlify Scrappa kapalı
};
