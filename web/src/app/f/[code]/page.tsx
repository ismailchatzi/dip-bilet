import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FollowChannels } from "@/components/landing/FollowChannels";
import { LandingCta } from "@/components/landing/LandingCta";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { DestPhoto } from "@/components/vitrin/DestPhoto";
import {
  dealCityName,
  dealCityTitle,
  dealDestCode,
  dealFoundLabel,
  dealStopsLabel,
  displayDealDiscountPercent,
  displayDealPrice,
  formatDealMoney,
} from "@/lib/deal-display";
import { destPhotoSets } from "@/lib/destination-photos";
import { getLandingData, maskedDateRange, tripMonths } from "@/lib/landing";
import { normalizePrefCity } from "@/lib/landing-pref";

export const revalidate = 300;

export async function generateStaticParams() {
  return [];
}

type PageProps = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const code = normalizePrefCity((await params).code);
  if (!code) return { title: "Dip Bilet" };
  const { deal } = await getLandingData(code);
  if (!deal) {
    return {
      title: "Bu fırsatın süresi doldu — Dip Bilet",
      description: "Yeni dip fiyatlar çıkınca ilk sen duy. Üyelik ücretsiz.",
    };
  }
  const price = formatDealMoney(displayDealPrice(deal.price), deal.currency);
  const title = `İstanbul → ${dealCityName(deal)} ${price} gidiş-dönüş — Dip Bilet`;
  const description = `${tripMonths(deal) ?? ""} uçuşları için yakaladığımız dip fiyat. Tarihler ve bilet linki üyelere açık.`;
  const image = destPhotoSets(dealDestCode(deal) || deal.destination)[0]?.full ?? deal.photoUrl?.trim();
  return {
    metadataBase: new URL("https://dipbilet.com"),
    title,
    description,
    openGraph: {
      type: "website",
      siteName: "Dip Bilet",
      locale: "tr_TR",
      url: `/f/${code.toLowerCase()}`,
      title,
      description,
      ...(image ? { images: [{ url: image, alt: dealCityTitle(deal) }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function LandingPage({ params }: PageProps) {
  const code = normalizePrefCity((await params).code);
  if (!code) notFound();
  const { deal, others } = await getLandingData(code);

  return (
    <div className="home-light">
      <SiteHeader />

      <main className="landing">
        {deal ? (
          <section className="landing-hero">
            <DestPhoto
              dest={dealDestCode(deal) || deal.destination}
              alt={dealCityTitle(deal)}
              className="landing-hero__media"
              imageUrl={deal.photoUrl}
              seed={deal.id}
            >
              {typeof displayDealDiscountPercent(deal) === "number" ? (
                <span className="deal-card__badge">
                  %{displayDealDiscountPercent(deal)} altında
                </span>
              ) : null}
            </DestPhoto>

            <div className="landing-hero__body">
              <p className="landing-hero__kicker">İstanbul’dan dip fırsat</p>
              <h1>{dealCityName(deal)}</h1>
              <p className="landing-hero__price">
                <strong>{formatDealMoney(displayDealPrice(deal.price), deal.currency)}</strong>
                {typeof deal.averagePrice === "number" ? (
                  <s>{formatDealMoney(deal.averagePrice, deal.currency)}</s>
                ) : null}
                {deal.returnDate ? <span>gidiş-dönüş</span> : null}
              </p>
              <ul className="landing-hero__facts">
                {tripMonths(deal) ? <li>{tripMonths(deal)} uçuşu</li> : null}
                <li>{dealStopsLabel(deal)}</li>
                {dealFoundLabel(deal) ? <li>{dealFoundLabel(deal)}</li> : null}
              </ul>

              <div className="landing-lock">
                {maskedDateRange(deal) ? (
                  <p className="landing-lock__dates" aria-hidden="true">
                    {maskedDateRange(deal)}
                  </p>
                ) : null}
                <p>Kesin tarihler ve bilet linki üyelere açık.</p>
              </div>

              <LandingCta code={code} label="Ücretsiz üye ol, fırsatı aç" />
              <p className="landing-hero__login">
                Zaten üye misin? <a href="/giris">Giriş yap</a>
              </p>
              <FollowChannels />
            </div>
          </section>
        ) : (
          <section className="landing-expired">
            <h1>Bu fırsatın süresi doldu</h1>
            <p>
              Dip fiyatlar genelde birkaç gün içinde kapanıyor. Benzerlerini
              kaçırmamak için ücretsiz üye ol; yeni fırsat çıkınca ilk sen duy.
            </p>
            <LandingCta code={code} label="Ücretsiz üye ol" />
            <FollowChannels />
          </section>
        )}

        <section className="landing-why">
          <h2>Dip Bilet nedir?</h2>
          <ul>
            <li>İstanbul’dan 28 şehre her gün binlerce bilet fiyatı tarıyoruz.</li>
            <li>
              Yalnızca normal fiyatının belirgin altına inen biletleri doğrulayıp
              gösteriyoruz.
            </li>
            <li>
              Takip ettiğin şehirde yeni dip fiyat çıkınca sana e-postayla haber
              veriyoruz. Üyelik ücretsiz.
            </li>
          </ul>
        </section>

        {others.length > 0 ? (
          <section className="landing-more">
            <h2>Şu an vitrinde</h2>
            <div className="landing-more__grid">
              {others.map((d) => (
                <article key={d.id} className="landing-more__card">
                  <DestPhoto
                    dest={dealDestCode(d) || d.destination}
                    alt={dealCityTitle(d)}
                    className="landing-more__media"
                    imageUrl={d.photoUrl}
                    seed={d.id}
                  />
                  <div className="landing-more__body">
                    <h3>{dealCityName(d)}</h3>
                    {tripMonths(d) ? <p>{tripMonths(d)}</p> : null}
                    <p className="landing-more__price" aria-label="Fiyat üyelere açık">
                      {formatDealMoney(displayDealPrice(d.price), d.currency)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <LandingCta code={code} label="Tüm fırsatları gör" />
          </section>
        ) : null}
      </main>

      <SiteFooter />
    </div>
  );
}
