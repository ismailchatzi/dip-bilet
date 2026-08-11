import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Üyelik Sözleşmesi — Dip Bilet",
};

export default function UyelikSozlesmesiPage() {
  return (
    <LegalShell title="Üyelik Sözleşmesi">
      <p>
        Bu sözleşme, Dip Bilet ücretsiz ve ücretli (premium) üyelik paketleri
        için geçerlidir. Ücretli abonelik açıldığında ödeme sağlayıcı ve fatura
        bilgileri bu metne eklenecektir.
      </p>

      <h2>1. Üyelik türleri</h2>
      <ul>
        <li>
          <strong>Ücretsiz üyelik:</strong> Sınırlı fırsat görünümü / gecikmeli
          bildirim gibi tadımlık özellikler.
        </li>
        <li>
          <strong>Ücretli üyelik (Dip Bilet Kulübü):</strong> Daha fazla / daha
          erken dip fırsat bildirimi ve ek özellikler (paket detayları sitede
          ilan edilir).
        </li>
      </ul>

      <h2>2. Kayıt</h2>
      <p>
        Üyelik için geçerli bir e-posta (ve istenirse telefon) gerekir. Yanlış
        bilgiyle açılan hesaplar kapatılabilir.
      </p>

      <h2>3. Ücretli abonelik ve iptal</h2>
      <p>
        Ücretler, süre (aylık/yıllık) ve yenileme koşulları ödeme ekranında
        gösterilir. İptal sonrası dönem sonuna kadar erişim sürebilir; zorunlu
        tüketici hakları saklıdır. Türkiye’deki mesafeli satış ve cayma
        haklarına ilişkin detaylar ticari süreç netleşince güncellenir.
      </p>

      <h2>4. Bildirimler</h2>
      <p>
        E-posta, push veya SMS ile fırsat bildirimi gönderilebilir. Pazarlama
        iletişimleri için ayrı rıza alınabilir; bildirimleri ayarlardan
        kapatabilirsiniz (zorunlu işlem mailleri hariç).
      </p>

      <h2>5. Fesih</h2>
      <p>
        Kullanım şartlarının ihlalinde hesap askıya alınabilir veya sonlandırılabilir.
        Siz de hesabınızı kapatmayı talep edebilirsiniz.
      </p>

      <h2>6. İletişim</h2>
      <p>
        Üyelik talepleri:{" "}
        <a href="mailto:info@dipbilet.com">info@dipbilet.com</a>
      </p>
    </LegalShell>
  );
}
