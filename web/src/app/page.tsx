import { HomeDealCarousel } from "@/components/home/HomeDealCarousel";
import { HomeFaq } from "@/components/home/HomeFaq";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="home-light">
      <SiteHeader />

      <main>
        <section className="home-hero">
          <div className="home-hero__media" aria-hidden="true" />
          <div className="home-hero__content">
            <h1>
              Bir sonraki uçuşunda büyük tasarruf et —
              <br />
              sen hiç uğraşma.
            </h1>
            <p>
              Kalkış havaalanından hayal destinasyonlarına ve sürpriz
              rotalara dip bilet çıkınca anında e-posta ile haberin olsun.
            </p>
            <a className="btn btn-hero-light" href="/uye-ol">
              Ücretsiz üye ol
            </a>
          </div>
        </section>

        <section className="home-how" id="nasil">
          <h2>Nasıl çalışır?</h2>
          <p className="home-how__lead">
            Üç adımda Dip Bilet Kulübü’ne katıl — üyelik ücretsiz.
          </p>
          <div className="home-how__grid">
            <article className="home-how__card">
              <div className="home-how__visual home-how__visual--chip">
                <img src="/how-1.png" alt="Kalkış seçimi" />
              </div>
              <h3>1. Kalkışını seç</h3>
              <p>
                Takip etmemizi istediğin kalkış noktasını belirle. Şimdilik
                İstanbul (IST / SAW) açık.
              </p>
            </article>
            <article className="home-how__card">
              <div className="home-how__visual">
                <img src="/how-2.png" alt="Destinasyon seçimi" />
              </div>
              <h3>2. Hayal destinasyonlarını seç</h3>
              <p>
                İlgilendiğin şehirleri işaretle; sürpriz dip rotaları da
                tararız.
              </p>
            </article>
            <article className="home-how__card">
              <div className="home-how__visual">
                <img src="/how-3.png" alt="Dip fırsat kartları" />
              </div>
              <h3>3. Dip fırsat uyarısı al</h3>
              <p>
                Ortalamanın çok altına inen veya hata fiyatı yakalandığında
                e-posta ile haberin olsun.
              </p>
            </article>
          </div>
          <div className="home-how__cta">
            <a className="btn btn-join-blue" href="/uye-ol">
              Ücretsiz üye ol
            </a>
          </div>
        </section>

        <HomeDealCarousel />

        <section className="home-mid-cta">
          <h2>
            Bir sonraki kaçamağında binlerce lira
            <br />
            cebinde kalsın — sen hiç arama.
          </h2>
          <p>
            Dip Bilet’e katıl; kalkışına göre dip fırsatlar yakalandığında
            ilk sen duy.
          </p>
          <a className="btn btn-join-blue" href="/uye-ol">
            Ücretsiz üye ol
          </a>
        </section>

        <HomeFaq />

        <section className="home-vacation">
          <div className="home-vacation__copy">
            <h2>Tatili hak ettin</h2>
            <p>
              Kalkışından hayal destinasyonlarına ve sürpriz rotalara dip
              bilet çıkınca e-posta ile haberin olsun.
            </p>
            <a className="btn btn-join-blue" href="/uye-ol">
              Ücretsiz üye ol
            </a>
          </div>
          <div className="home-vacation__phone">
            <img src="/phone-alert.png" alt="Dip Bilet fırsat uyarısı" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
