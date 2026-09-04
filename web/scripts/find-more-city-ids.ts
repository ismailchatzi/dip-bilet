const UA = "Mozilla/5.0";
const KEY = process.env.SERPAPI_API_KEY!;

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function ok(title: string, expects: string[]) {
  const t = norm(title);
  if (!t || /404/.test(t) || /where to stay in\s+\|/i.test(title)) return false;
  return expects.some((e) => {
    const n = norm(e);
    return (
      n.length >= 3 &&
      new RegExp(`(^|[^a-z0-9])${n}([^a-z0-9]|$)`, "i").test(t)
    );
  });
}

async function titleFor(id: number) {
  const r = await fetch(
    `https://www.trip.com/hotels/list?city=${id}&checkIn=2026-10-01&checkOut=2026-10-05&adult=2&crn=1&curr=USD&locale=en-XX`,
    { headers: { "User-Agent": UA } },
  );
  const h = await r.text();
  return (h.match(/<title>([^<]+)/) || [])[1] || "";
}

async function find(iata: string, expects: string[]) {
  for (const name of expects) {
    const q = encodeURIComponent(`site:us.trip.com/hotels "${name}" hotels-list`);
    const j = (await (
      await fetch(
        `https://serpapi.com/search.json?engine=google&q=${q}&num=10&api_key=${KEY}`,
      )
    ).json()) as { organic_results?: Array<{ link?: string }> };
    for (const row of j.organic_results ?? []) {
      const m = (row.link || "").match(/hotels-list-(\d+)/i);
      if (!m) continue;
      const id = Number(m[1]);
      const title = await titleFor(id);
      if (ok(title, expects)) {
        console.log("FOUND", iata, id, title);
        return;
      }
      console.log("reject", iata, id, title.slice(0, 55));
    }
  }
  console.log("NONE", iata);
}

async function main() {
  const jobs: [string, string[]][] = [
    ["DOH", ["doha"]],
    ["WAW", ["warsaw"]],
    ["LIS", ["lisbon"]],
    ["OSL", ["oslo"]],
    ["HEL", ["helsinki"]],
    ["DUB", ["dublin"]],
    ["ZRH", ["zurich"]],
    ["BHK", ["bukhara"]],
    ["ERZ", ["erzurum"]],
    ["KSY", ["kars"]],
    ["EIN", ["eindhoven"]],
    ["BJL", ["banjul"]],
  ];

  for (const [a, e] of jobs) await find(a, e);
}

main().catch(console.error);
