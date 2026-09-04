/**
 * Canlı vitrin — otel / araç / aktivite link denetimi (kullanıcı gözü).
 * npx tsx --env-file=.env.local scripts/audit-trip-extras.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  dealDestCode,
  dealWithinStopLimit,
  isUnverifiedOneWaySum,
  vitrinHeroDeals,
} from "../src/lib/deal-display.ts";
import { isLiveDeal } from "../src/lib/scan/deal-archive.ts";
import { emptyDealsPayload } from "../src/lib/scan/board.ts";
import { fetchHotelOfferCards } from "../src/lib/affiliate/tripcom-hotels.ts";
import { TRIPCOM_CITY_ID } from "../src/lib/affiliate/tripcom-city-ids.ts";
import { fetchCarRentalCards } from "../src/lib/affiliate/car-rentals.ts";
import { fetchActivityOfferCards } from "../src/lib/affiliate/activities.ts";
import { effectiveCarRentalDates } from "../src/lib/affiliate/car-rental-dates.ts";
import { bookingCityQuery } from "../src/lib/affiliate/booking-hotels.ts";
import type { Deal } from "../src/lib/types.ts";

type Issue = { city: string; area: string; detail: string };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function cityLabelOf(deal: Deal) {
  return (deal.destination || dealDestCode(deal) || "?").replace(/\s*\([A-Z]{3}\)\s*$/i, "").trim();
}

/** "mus" ⊂ "paramus" gibi yanlış pozitifleri reddet — yalnız sınırlı eşleşme. */
function nameAppearsInText(haystack: string, needle: string) {
  const h = haystack.toLowerCase();
  const n = needle
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
  if (n.length < 3) return false;
  if (h.includes(n)) {
    // kelime sınırı: baş/son veya tire/ boşluk
    const re = new RegExp(`(^|[^a-z0-9])${n.replace(/-/g, "[-\\s]?")}([^a-z0-9]|$)`, "i");
    if (re.test(h)) return true;
  }
  return false;
}

function parseUrl(raw: string) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

async function tripTitle(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    const html = await res.text();
    return (html.match(/<title>([^<]+)<\/title>/i)?.[1] || "").trim();
  } catch {
    return "";
  }
}

async function loadLiveDeals(): Promise<Deal[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Supabase env yok");
  const sb = createClient(url, key);
  const { data, error } = await sb
    .from("scan_board")
    .select("deals")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  const payload = (data?.deals as { deals?: Deal[] } | null) ?? emptyDealsPayload();
  return vitrinHeroDeals(
    (payload.deals ?? []).filter(
      (d) => isLiveDeal(d) && dealWithinStopLimit(d) && !isUnverifiedOneWaySum(d),
    ),
  );
}

async function auditDeal(deal: Deal): Promise<{ ok: string[]; issues: Issue[] }> {
  const ok: string[] = [];
  const issues: Issue[] = [];
  const code = dealDestCode(deal);
  const city = cityLabelOf(deal);
  const out = deal.outboundDate;
  const ret = deal.returnDate;
  if (!code || !out || !ret) {
    issues.push({ city, area: "genel", detail: "Şehir kodu veya tarih eksik" });
    return { ok, issues };
  }

  const expectedDates = effectiveCarRentalDates(out, ret);
  const enName = bookingCityQuery(code, city);

  // —— OTEL ——
  try {
    const hotels = await fetchHotelOfferCards(code, city, out, ret);
    if (!hotels || hotels.cards.length === 0) {
      issues.push({ city, area: "otel", detail: "Otel vitrini boş / yok" });
    } else {
      const expectedCityId = TRIPCOM_CITY_ID[code] ?? hotels.cityId;
      const search = parseUrl(hotels.searchUrl);
      const searchCity = search?.searchParams.get("city");
      if (!searchCity || (expectedCityId && searchCity !== String(expectedCityId))) {
        issues.push({
          city,
          area: "otel",
          detail: `Arama linkinde şehir numarası yanlış veya yok (beklenen ${expectedCityId}, gelen ${searchCity || "yok"})`,
        });
      } else if (
        search?.searchParams.get("checkIn") !== expectedDates.pickup ||
        search?.searchParams.get("checkOut") !== expectedDates.dropoff
      ) {
        issues.push({
          city,
          area: "otel",
          detail: `Tarihler kaymış: link ${search?.searchParams.get("checkIn")}→${search?.searchParams.get("checkOut")}, uçuş ${expectedDates.pickup}→${expectedDates.dropoff}`,
        });
      } else {
        ok.push(`otel arama OK (${hotels.cards.length} kart, city ${searchCity})`);
      }

      for (const card of hotels.cards) {
        const u = parseUrl(card.bookUrl);
        if (!u) {
          issues.push({ city, area: "otel", detail: `Bozuk kart linki: ${card.name}` });
          continue;
        }
        const cityId = u.searchParams.get("cityId") || u.searchParams.get("city");
        if (!cityId || (expectedCityId && cityId !== String(expectedCityId))) {
          issues.push({
            city,
            area: "otel",
            detail: `"${card.name}" yanlış/eksik şehir (cityId=${cityId || "yok"})`,
          });
          continue;
        }
        const cin = u.searchParams.get("checkIn");
        const cout = u.searchParams.get("checkOut");
        if (cin && cout && (cin !== expectedDates.pickup || cout !== expectedDates.dropoff)) {
          issues.push({
            city,
            area: "otel",
            detail: `"${card.name}" tarihleri uçuşla uyuşmuyor (${cin}→${cout})`,
          });
        }
      }

      // Spot-check: arama sayfası başlığı gerçekten bu şehir mi?
      if (search && expectedCityId) {
        const title = await tripTitle(hotels.searchUrl);
        if (title && !/404/i.test(title)) {
          const aliases = [city, enName, code].filter(Boolean) as string[];
          const hit = aliases.some((a) => nameAppearsInText(title, a));
          // Maldives/Bali gibi ülke adı da kabul
          const loose =
            /maldives|bali|phuket|sharm/i.test(enName) &&
            aliases.some((a) => nameAppearsInText(title, a.split(" ")[0]!));
          if (!hit && !loose) {
            issues.push({
              city,
              area: "otel",
              detail: `Trip.com sayfa başlığı şüpheli: "${title.slice(0, 80)}" (beklenen ~${enName})`,
            });
          } else {
            ok.push(`otel sayfa başlığı OK: ${title.slice(0, 50)}`);
          }
        }
      }
    }
  } catch (e) {
    issues.push({ city, area: "otel", detail: `Hata: ${(e as Error).message}` });
  }

  // —— ARAÇ ——
  try {
    const cars = await fetchCarRentalCards(code, city, out, ret);
    if (!cars || cars.cards.length === 0) {
      issues.push({ city, area: "araç", detail: "Araç vitrini boş / yok" });
    } else {
      const u = parseUrl(cars.searchUrl);
      // affiliate URL ise custom_url / u param içinden gerçek aramayı çıkar
      let deep = cars.searchUrl;
      if (u) {
        const nested =
          u.searchParams.get("custom_url") ||
          u.searchParams.get("u") ||
          u.searchParams.get("url");
        if (nested) deep = nested;
      }
      const deepU = parseUrl(deep) || u;
      if (!deepU) {
        issues.push({ city, area: "araç", detail: "Araç arama linki bozuk" });
      } else {
        const pickup =
          deepU.searchParams.get("pickup_iata") ||
          deepU.searchParams.get("pickup") ||
          "";
        const dropoff =
          deepU.searchParams.get("dropoff_iata") ||
          deepU.searchParams.get("dropoff") ||
          "";
        if (pickup.toUpperCase() !== code || dropoff.toUpperCase() !== code) {
          issues.push({
            city,
            area: "araç",
            detail: `Havalimanı kodu yanlış (pickup=${pickup || "yok"}, dropoff=${dropoff || "yok"}, beklenen ${code})`,
          });
        } else {
          ok.push(`araç IATA OK (${cars.provider}, ${cars.cards.length} kart)`);
        }

        const pDate =
          deepU.searchParams.get("from_date_0") ||
          deepU.searchParams.get("pickupDate") ||
          "";
        const dDate =
          deepU.searchParams.get("to_date_0") ||
          deepU.searchParams.get("dropoffDate") ||
          "";
        if (
          pDate &&
          dDate &&
          (pDate !== expectedDates.pickup || dDate !== expectedDates.dropoff)
        ) {
          issues.push({
            city,
            area: "araç",
            detail: `Tarihler kaymış: ${pDate}→${dDate} (beklenen ${expectedDates.pickup}→${expectedDates.dropoff})`,
          });
        } else if (pDate && dDate) {
          ok.push(`araç tarih OK`);
        }

        for (const card of cars.cards) {
          const cu = parseUrl(card.bookUrl);
          let cDeep = card.bookUrl;
          if (cu) {
            const nested =
              cu.searchParams.get("custom_url") ||
              cu.searchParams.get("u") ||
              cu.searchParams.get("url");
            if (nested) cDeep = nested;
          }
          const cU = parseUrl(cDeep);
          if (!cU) continue;
          const cp =
            cU.searchParams.get("pickup_iata") ||
            cU.searchParams.get("pickup") ||
            "";
          if (cp && cp.toUpperCase() !== code) {
            issues.push({
              city,
              area: "araç",
              detail: `"${card.name}" yanlış havalimanı (${cp})`,
            });
          }
          // kategori metninde şehir adı var mı? (yanlış şehir etiketi)
          if (
            card.category &&
            enName.length >= 4 &&
            !nameAppearsInText(card.category, enName) &&
            !nameAppearsInText(card.category, city) &&
            !card.category.includes(code)
          ) {
            // soft: sadece açıkça başka bilinen şehir yazıyorsa şikayet et
            const strangers = Object.entries(TRIPCOM_CITY_ID)
              .filter(([iat]) => iat !== code)
              .map(([iat]) => bookingCityQuery(iat))
              .filter((n) => n.length >= 4 && nameAppearsInText(card.category!, n));
            if (strangers.length) {
              issues.push({
                city,
                area: "araç",
                detail: `"${card.name}" etiketinde başka şehir: ${strangers[0]}`,
              });
            }
          }
        }
      }
    }
  } catch (e) {
    issues.push({ city, area: "araç", detail: `Hata: ${(e as Error).message}` });
  }

  // —— AKTİVİTE ——
  try {
    const acts = await fetchActivityOfferCards(code, city, deal.destination);
    if (!acts || acts.cards.length === 0) {
      ok.push("aktivite yok (envanter yoksa normal)");
    } else {
      const blob = [acts.searchUrl, ...acts.cards.map((c) => `${c.name} ${c.bookUrl}`)].join(
        " | ",
      );
      const aliases = [city, enName].filter((x) => x && x.length >= 3) as string[];
      const cityHit = aliases.some((a) => nameAppearsInText(blob, a));

      // Bilinen yabancı şehir isimleri (yanlış yönlendirme)
      const foreignHits: string[] = [];
      for (const [iat, id] of Object.entries(TRIPCOM_CITY_ID)) {
        if (iat === code) continue;
        const foreign = bookingCityQuery(iat);
        if (foreign.length < 4) continue;
        // substring tuzağı: mus ⊂ paramus — nameAppearsInText sınırlı
        if (nameAppearsInText(blob, foreign) && !aliases.some((a) => nameAppearsInText(foreign, a))) {
          // sadece kart başlığında / path'te güçlü sinyal
          const inTitles = acts.cards.some(
            (c) =>
              nameAppearsInText(c.name, foreign) ||
              nameAppearsInText(c.bookUrl, foreign),
          );
          if (inTitles) foreignHits.push(foreign);
        }
        void id;
      }

      // ABD/NJ klasik kaçaklar
      for (const bad of ["paramus", "jersey city", "new jersey", "dopamine land"]) {
        if (nameAppearsInText(blob, bad)) foreignHits.push(bad);
      }

      if (foreignHits.length) {
        issues.push({
          city,
          area: "aktivite",
          detail: `Başka şehrin aktiviteleri görünüyor: ${[...new Set(foreignHits)].slice(0, 4).join(", ")}`,
        });
      } else if (!cityHit && acts.provider === "tiqets") {
        // Tiqets path şehir slug'ı
        const path = acts.searchUrl;
        issues.push({
          city,
          area: "aktivite",
          detail: `Şehir adı link/başlıklarda net değil — kontrol et: ${path.slice(0, 100)}`,
        });
      } else {
        ok.push(`aktivite OK (${acts.provider}, ${acts.cards.length} kart)`);
      }
    }
  } catch (e) {
    issues.push({ city, area: "aktivite", detail: `Hata: ${(e as Error).message}` });
  }

  return { ok, issues };
}

async function main() {
  const deals = await loadLiveDeals();
  console.log(`\nCanlı vitrin: ${deals.length} şehir\n`);

  const allIssues: Issue[] = [];
  const summary: string[] = [];

  for (const deal of deals) {
    const city = cityLabelOf(deal);
    const code = dealDestCode(deal);
    process.stdout.write(`→ ${city} (${code}) ${deal.outboundDate}→${deal.returnDate} … `);
    const { ok, issues } = await auditDeal(deal);
    if (issues.length === 0) {
      console.log("TEMİZ");
      summary.push(`✅ ${city}`);
    } else {
      console.log(`${issues.length} sorun`);
      summary.push(`❌ ${city} (${issues.length})`);
      allIssues.push(...issues);
      for (const i of issues) console.log(`   · [${i.area}] ${i.detail}`);
    }
    void ok;
  }

  console.log("\n========== RAPOR ==========\n");
  console.log(`Taranan şehir: ${deals.length}`);
  console.log(`Sorunlu şehir: ${summary.filter((s) => s.startsWith("❌")).length}`);
  console.log(`Temiz: ${summary.filter((s) => s.startsWith("✅")).length}`);
  if (allIssues.length === 0) {
    console.log("\nSonuç: Canlı vitrindeki otel / araç / aktivite yönlendirmelerinde sorun görünmüyor.");
  } else {
    console.log("\nBulunan sorunlar:");
    for (const i of allIssues) {
      console.log(`- ${i.city} / ${i.area}: ${i.detail}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
