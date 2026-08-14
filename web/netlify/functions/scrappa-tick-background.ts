import { runScrappaTick } from "../lib/trigger-scrappa";

/** 5 dk: deftere bak, kesildiyse kaldığı yerden devam. */
export default async (req?: Request) => {
  let force = false;
  try {
    if (req) {
      const body = (await req.json()) as { force?: boolean };
      const secret = process.env.CRON_SECRET?.trim();
      const auth = req.headers.get("authorization");
      if (body?.force === true && secret && auth === `Bearer ${secret}`) {
        force = true;
      }
    }
  } catch {
    /* scheduled */
  }
  await runScrappaTick(force);
};

export const config = {
  schedule: "*/5 * * * *",
};
