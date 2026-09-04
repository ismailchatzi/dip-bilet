import { fetchActivityOfferCards } from "../src/lib/affiliate/activities.ts";

async function main() {
  for (const [iata, city] of [
    ["SJJ", "Saraybosna"],
    ["TIA", "Tiran"],
    ["BEG", "Belgrad"],
  ] as const) {
    const r = await fetchActivityOfferCards(iata, city, city);
    console.log(
      iata,
      r
        ? {
            provider: r.provider,
            n: r.cards.length,
            names: r.cards.map((c) => c.name.slice(0, 50)),
            klook: r.cards.some((c) => c.bookUrl.includes("klook") || c.bookUrl.includes("2075")),
          }
        : null,
    );
  }
}

main().catch(console.error);
