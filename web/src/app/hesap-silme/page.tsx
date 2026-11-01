import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LegalShell } from "@/components/LegalShell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Hesap silme — Dip Bilet",
  description:
    "Dip Bilet hesabınızı ve ilişkili verilerinizi nasıl sileceğinizi açıklar.",
};

export const dynamic = "force-dynamic";

export default async function HesapSilmePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Oturum açıksa doğrudan gerçek silme ekranına
  if (user) {
    redirect("/hesap-ayarlari#hesabi-sil");
  }

  return (
    <LegalShell title="Hesap silme — Dip Bilet" updated="1 Kasım 2026">
      <p>
        Bu sayfa Dip Bilet (dipbilet.com ve Dip Bilet mobil uygulaması) üyeleri
        içindir. Hesabını ve ilişkili verilerini kalıcı olarak silmek isteyenler
        buradan ilerler.
      </p>

      <h2>Dip Bilet üyeliğin yoksa</h2>
      <p>
        Silinecek bir hesap yoktur. Üye olmak istersen{" "}
        <Link href="/uye-ol">üye ol</Link> sayfasına git; giriş için{" "}
        <Link href="/giris">giriş yap</Link>.
      </p>
      <h2>Üyeliğin varsa — silme adımları</h2>
      <ol>
        <li>
          <Link href="/giris">Giriş yap</Link> (veya uygulamada oturum aç).
        </li>
        <li>
          Girişten sonra{" "}
          <Link href="/hesap-ayarlari#hesabi-sil">Hesap ayarları → Hesabı sil</Link>{" "}
          bölümüne gel; gerçek silme düğmesi oradadır.
        </li>
        <li>
          <strong>Sil</strong> düğmesine basıp onayla. İşlem geri alınamaz;
          oturumun kapanır.
        </li>
      </ol>

      <h2>Giriş yapamıyorsan</h2>
      <p>
        Kayıtlı e-posta adresinle{" "}
        <a href="mailto:info@dipbilet.com?subject=Dip%20Bilet%20hesap%20silme">
          info@dipbilet.com
        </a>{" "}
        adresine “hesap silme” talebi yaz. Talebi makul sürede işleriz.
      </p>

      <h2>Silinen ve saklanan veriler</h2>
      <ul>
        <li>
          <strong>Silinir:</strong> hesap profili, tercihler (kalkış, bütçe,
          destinasyon), fiyat alarmları, push/bildirim kayıtları ve oturum
          bilgileri.
        </li>
        <li>
          <strong>Kısa süre tutulabilir:</strong> yasal yükümlülük, güvenlik veya
          kötüye kullanımın önlenmesi için gerekli teknik kayıtlar; amaç
          kalkınca silinir veya anonimleştirilir.
        </li>
      </ul>
      <p>
        Ayrıntılar: <Link href="/gizlilik">Gizlilik Politikası</Link>.
      </p>
    </LegalShell>
  );
}
