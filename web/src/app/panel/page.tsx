import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DealRow } from "@/components/DealRow";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { EmailAlertsToggle } from "@/components/EmailAlertsToggle";
import { SiteFooter } from "@/components/SiteFooter";
import { getDeals } from "@/lib/deals";
import {
  mergeDealsAndFares,
  readCityFaresCache,
} from "@/lib/scan/city-cache";
import { createClient } from "@/lib/supabase/server";

function envNumber(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const metadata: Metadata = {
  title: "Panel — Dip Bilet",
};

export const dynamic = "force-dynamic";

function sourceLabel(source: string) {
  if (source === "serpapi") return "Canlı tarama";
  if (source === "cache") return "Önbellek";
  return "Demo veri";
}

function formatFetchedAt(iso: string) {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function PanelPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <main>
        <div className="site-shell">
          <header className="topbar">
            <Link className="brand" href="/" aria-label="Dip Bilet">
              <Image
                className="brand-logo"
                src="/logo-db.png?v=3"
                alt=""
                width={242}
                height={163}
                priority
                unoptimized
              />
              <span className="brand-wordmark">Dip Bilet</span>
            </Link>
          </header>
          <section className="auth-hero">
            <h1>Panel hazırlanıyor</h1>
            <p>
              Üyelik altyapısı bağlanınca burada canlı dip fırsatların ve
              bildirim ayarların görünecek.
            </p>
            <p>
              <Link className="btn btn-primary" href="/uye-ol">
                Üye ol sayfasına dön
              </Link>
            </p>
          </section>
          <SiteFooter />
        </div>
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/giris");
  }

  const cacheHours = envNumber("DEALS_CACHE_HOURS", 12);
  const minDiscount = envNumber("MIN_DISCOUNT_PERCENT", 30);

  const [{ data: profile }, dealsPayload, cityFares] = await Promise.all([
    supabase
      .from("profiles")
      .select("email_alerts")
      .eq("id", user.id)
      .maybeSingle(),
    getDeals(),
    readCityFaresCache(cacheHours * 2),
  ]);

  const payload = mergeDealsAndFares(dealsPayload, cityFares, minDiscount);
  const emailAlerts = profile?.email_alerts ?? true;

  return (
    <main>
      <div className="site-shell">
        <header className="topbar">
          <Link className="brand" href="/" aria-label="Dip Bilet">
            <Image
              className="brand-logo"
              src="/logo-db.png?v=3"
              alt=""
              width={242}
              height={163}
              priority
              unoptimized
            />
            <span className="brand-wordmark">Dip Bilet</span>
          </Link>
          <form action="/auth/signout" method="post">
            <button className="btn btn-ghost" type="submit">
              Çıkış
            </button>
          </form>
        </header>

        <section className="auth-hero">
          <h1>Hoş geldin</h1>
          <p>
            {user.email} — İstanbul (IST / SAW) çıkışlı dip fırsatlar burada.
          </p>
        </section>

        <EmailAlertsToggle initialEnabled={emailAlerts} />

        <section className="section-head">
          <div>
            <h2>Güncel dip fırsatlar</h2>
            <p>
              {sourceLabel(payload.source)} · güncelleme{" "}
              {formatFetchedAt(payload.fetchedAt)} · kalkış {payload.departure}
            </p>
          </div>
        </section>

        {payload.warning ? (
          <p className="auth-alert auth-alert--error" role="status">
            {payload.warning}
          </p>
        ) : null}

        {payload.deals.length === 0 ? (
          <div className="empty">
            Şu an eşiğin üzerinde dip fırsat yok. Biraz sonra tekrar bak.
          </div>
        ) : (
          <div className="deal-list">
            {payload.deals.map((deal) => (
              <DealRow key={deal.id} deal={deal} mode="live" />
            ))}
          </div>
        )}

        <DeleteAccountButton />

        <SiteFooter />
      </div>
    </main>
  );
}
