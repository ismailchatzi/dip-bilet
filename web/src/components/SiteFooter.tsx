import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <p className="site-footer__disclaimer">
        Dip Bilet bir seyahat acentesi veya bilet satıcısı değildir. Paylaşılan
        bilgiler bilgilendirme amaçlıdır; fiyatlar anlık değişebilir. Satın alma
        işlemleri yönlendirildiğiniz üçüncü taraf sitelerde gerçekleşir.
      </p>

      <nav className="site-footer__nav" aria-label="Yasal">
        <Link href="/gizlilik">Gizlilik Politikası (KVKK)</Link>
        <Link href="/kullanim-sartlari">Kullanım Şartları</Link>
        <Link href="/uyelik-sozlesmesi">Üyelik Sözleşmesi</Link>
        <Link href="/cerez-politikasi">Çerez Politikası</Link>
        <Link href="/iletisim">İletişim</Link>
      </nav>

      <p className="site-footer__copy">
        © {year} Dip Bilet. Tüm hakları saklıdır.
      </p>
    </footer>
  );
}
