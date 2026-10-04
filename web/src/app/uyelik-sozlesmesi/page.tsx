import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Üyelik Sözleşmesi — Dip Bilet",
};

export default function UyelikSozlesmesiPage() {
  return (
    <LegalShell title="Üyelik Sözleşmesi" updated="4 Ekim 2026">
      <p>
        Bu sözleşme, Dip Bilet üyeliği için geçerlidir. Dip Bilet’te yalnızca
        ücretsiz üyelik bulunur; üyelik için herhangi bir ücret alınmaz.
      </p>

      <h2>1. Üyelik</h2>
      <p>
        Ücretsiz üyelikle vitrindeki dip fırsatları görebilir ve seçtiğiniz
        destinasyonlar için fırsat bildirimleri alabilirsiniz.
      </p>

      <h2>2. Kayıt</h2>
      <p>
        Üyelik için geçerli bir e-posta (ve istenirse telefon) gerekir. Yanlış
        bilgiyle açılan hesaplar kapatılabilir.
      </p>

      <h2>3. Bildirimler</h2>
      <p>
        E-posta, push veya SMS ile fırsat bildirimi gönderilebilir. Pazarlama
        iletişimleri için ayrı rıza alınabilir; bildirimleri ayarlardan
        kapatabilirsiniz (zorunlu işlem mailleri hariç).
      </p>

      <h2>4. Fesih</h2>
      <p>
        Kullanım şartlarının ihlalinde hesap askıya alınabilir veya sonlandırılabilir.
        Siz de hesabınızı kapatmayı talep edebilirsiniz.
      </p>

      <h2>5. İletişim</h2>
      <p>
        Üyelik talepleri:{" "}
        <a href="mailto:info@dipbilet.com">info@dipbilet.com</a>
      </p>
    </LegalShell>
  );
}
