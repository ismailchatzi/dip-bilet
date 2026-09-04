import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="home-footer">
      <div className="home-footer__grid">
        <div>
          <h3>Yasal</h3>
          <Link href="/gizlilik">Gizlilik (KVKK)</Link>
          <Link href="/kullanim-sartlari">Kullanım Şartları</Link>
          <Link href="/uyelik-sozlesmesi">Üyelik Sözleşmesi</Link>
          <Link href="/cerez-politikasi">Çerez Politikası</Link>
        </div>
        <div>
          <h3>Yardım</h3>
          <Link href="/sss">SSS</Link>
          <Link href="/iletisim">İletişim</Link>
        </div>
        <div>
          <h3>Başla</h3>
          <Link href="/uye-ol">Kayıt ol</Link>
          <Link href="/giris">Giriş yap</Link>
        </div>
      </div>
      <p className="home-footer__disclaimer">
        Dip Bilet bir seyahat acentesi veya bilet satıcısı değildir. Paylaşılan
        bilgiler bilgilendirme amaçlıdır; fiyatlar anlık değişebilir. Satın alma
        işlemleri yönlendirildiğiniz üçüncü taraf sitelerde gerçekleşir.
      </p>
      <p className="home-footer__copy">© {year} Dip Bilet. Tüm hakları saklıdır.</p>
    </footer>
  );
}
