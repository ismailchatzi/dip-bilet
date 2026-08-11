import { DealRow } from "@/components/DealRow";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { archiveDeals } from "@/lib/archive-deals";

export default async function Home() {
  return (
    <main>
      <div className="site-shell">
        <SiteHeader />

        <section className="hero">
          <h1>
            Uçuş arama.
            <br />
            <em>Dip bulma.</em>
          </h1>
          <p>
            Sen rota seçip boğulma. Biz İstanbul çıkışlı biletleri tararız;
            ortalamanın inanılmaz derecede altına ineni buraya düşürürüz.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#arsiv">
              Geçmiş fırsatlar
            </a>
          </div>
        </section>

        <section id="nasil" className="section-head section-head--center section-head--lead">
          <div>
            <p className="section-head__lead">
              Üye ol, Dip Bilet Kulübü’ne katıl.
              <br />
              Hata fiyatı (error / mistake fare), flaş indirim ve ortalamanın
              çok altına inen biletlerden anında haberin olsun.
            </p>
          </div>
        </section>

        <div className="club-cta">
          <a className="btn btn-signup" href="/uye-ol">
            Ücretsiz Üye Ol
          </a>
        </div>

        <section id="arsiv" className="section-head section-head--center">
          <div>
            <h2>Yakalanan fırsatlar</h2>
            <p>
              Daha önce yakalanmış, süresi dolmuş örnekler. Artık geçerli
              değil — bir sonrakini kaçırmamak için kulübe katıl.
            </p>
          </div>
        </section>

        <div className="deal-list">
          {archiveDeals.map((deal) => (
            <DealRow key={deal.id} deal={deal} />
          ))}
        </div>

        <SiteFooter />
      </div>
    </main>
  );
}
