import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Gizlilik Politikası (KVKK) — Dip Bilet",
};

export default function GizlilikPage() {
  return (
    <LegalShell title="Gizlilik Politikası (KVKK)">
      <p>
        Bu metin, Dip Bilet (“Platform”) üyelik ve bildirim hizmetleri kapsamında
        kişisel verilerinizin işlenmesine ilişkin bilgilendirme amaçlıdır. 6698
        sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) çerçevesinde
        hazırlanmıştır. Nihai hukuki metin, ticari unvan ve veri sorumlusu
        bilgileriniz netleştikçe güncellenmelidir.
      </p>

      <h2>1. Veri sorumlusu</h2>
      <p>
        Veri sorumlusu: Dip Bilet / dipbilet.com işletmecisi.
        <br />
        İletişim:{" "}
        <a href="mailto:info@dipbilet.com">info@dipbilet.com</a>
      </p>

      <h2>2. İşlenen veriler</h2>
      <ul>
        <li>Kimlik / iletişim: ad-soyad (varsa), e-posta, telefon</li>
        <li>Hesap: üyelik tipi, tercihler (kalkış, bütçe, bölge)</li>
        <li>Teknik: IP, tarayıcı, cihaz, çerez kayıtları</li>
        <li>İşlem: abonelik / ödeme kayıtları (ödeme sağlayıcı üzerinden)</li>
      </ul>

      <h2>3. Amaçlar</h2>
      <ul>
        <li>Üyelik oluşturma ve hesap yönetimi</li>
        <li>Fırsat / dip bilet bildirimleri (e-posta, push, SMS)</li>
        <li>Sözleşmenin ifası ve müşteri destek</li>
        <li>Güvenlik, kötüye kullanımın önlenmesi</li>
        <li>Yasal yükümlülüklerin yerine getirilmesi</li>
      </ul>

      <h2>4. Hukuki sebepler</h2>
      <p>
        Veriler; sözleşmenin kurulması/ifası, meşru menfaat, açık rıza (pazarlama
        iletişimleri için) ve kanuni yükümlülükler kapsamında işlenebilir.
      </p>

      <h2>5. Aktarım</h2>
      <p>
        Hizmet için zorunlu olduğunda barındırma, e-posta, bildirim, analitik ve
        ödeme altyapısı sağlayıcılarıyla sınırlı veri paylaşımı yapılabilir.
        Yurt dışına aktarım söz konusuysa KVKK’daki usullere uyulur.
      </p>

      <h2>6. Saklama süresi</h2>
      <p>
        Veriler, işleme amacının gerektirdiği süre ve ilgili mevzuattaki zamanaşımı
        süreleri boyunca saklanır; amaç ortadan kalkınca silinir veya anonim hale
        getirilir.
      </p>

      <h2>7. Haklarınız</h2>
      <p>
        KVKK m.11 kapsamında; verilerinize erişme, düzeltme, silme, işlemeyi
        kısıtlama, itiraz ve şikâyet haklarınız vardır. Taleplerinizi{" "}
        <a href="mailto:info@dipbilet.com">info@dipbilet.com</a> adresine
        iletebilirsiniz.
      </p>
    </LegalShell>
  );
}
