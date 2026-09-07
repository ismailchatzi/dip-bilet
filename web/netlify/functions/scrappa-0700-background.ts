import { startScrappaDay } from "../lib/trigger-scrappa";

/** TR 07:00 = UTC 04:00 — günlük kuyruk: near → rematch → full(N). */
export default async () => {
  await startScrappaDay();
};

export const config = {
  // VPS tarıyor; Netlify Scrappa kapalı
};
