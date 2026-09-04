import { fetchActivityOfferCards } from "../src/lib/affiliate/activities.ts";
import { discoverTiqetsCity } from "../src/lib/affiliate/activity-discover.ts";

async function main() {
  const cfg = await discoverTiqetsCity("EIN", "Eindhoven", "Eindhoven");
  console.log("cfg", cfg);
  const a = await fetchActivityOfferCards("EIN", "Eindhoven", "Eindhoven");
  console.log(
    a?.cards.map((c) => ({ name: c.name, url: c.bookUrl.slice(0, 120) })),
  );
  console.log("search", a?.searchUrl?.slice(0, 150));
}

main().catch(console.error);
