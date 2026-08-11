import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Kullanım Şartları — Dip Bilet",
};

export default function KullanimSartlariPage() {
  return (
    <LegalShell title="Kullanım Şartları">
      <p>
        Dip Bilet web sitesi ve ileride sunulacak mobil uygulamayı (“Hizmet”)
        kullanarak aşağıdaki şartları kabul etmiş sayılırsınız.
      </p>

      <h2>1. Hizmetin niteliği</h2>
      <p>
        Dip Bilet, uçuş fırsatlarını tarayan / listeleyen bir bilgilendirme ve
        bildirim platformudur. Seyahat acentesi değildir; bilet satmaz, rezervasyon
        yapmaz, taşıyıcı veya acente adına işlem gerçekleştirmez.
      </p>

      <h2>2. Fiyat ve içerik</h2>
      <ul>
        <li>Gösterilen fiyatlar anlık değişebilir veya tükenebilir.</li>
        <li>
          “Ortalama altı”, “hata fiyatı” vb. etiketler bilgilendirme amaçlıdır;
          kesin tasarruf garantisi vermez.
        </li>
        <li>
          Satın alma, yönlendirildiğiniz üçüncü taraf sitelerin kendi
          koşullarına tabidir.
        </li>
      </ul>

      <h2>3. Üyelik</h2>
      <p>
        Bazı özellikler üyelik gerektirir. Hesap bilgilerinizin doğruluğundan ve
        güvenliğinden siz sorumlusunuz. Hesap paylaşımı Platform’un tek taraflı
        kısıtlama hakkını saklı tutar.
      </p>

      <h2>4. Yasaklı kullanımlar</h2>
      <p>
        Hizmeti bot / scrape ile aşırı yüklemek, tersine mühendislik, yasa dışı
        içerik veya başkalarının haklarını ihlal eden kullanım yasaktır.
      </p>

      <h2>5. Sorumluluğun sınırı</h2>
      <p>
        Dip Bilet; kaçırılan fırsat, fiyat farkı, iptal/değişiklik ücretleri,
        vize, bagaj veya üçüncü taraf sitelerdeki işlemlerden doğan zararlardan
        sorumlu tutulamaz. Hizmet “olduğu gibi” sunulur.
      </p>

      <h2>6. Fikri mülkiyet</h2>
      <p>
        Site tasarımı, marka, logo ve metinler Dip Bilet’e aittir. İzinsiz kopyalama
        yasaktır.
      </p>

      <h2>7. Değişiklikler</h2>
      <p>
        Bu şartlar güncellenebilir. Güncel sürüm sitede yayımlandığı andan itibaren
        geçerlidir.
      </p>
    </LegalShell>
  );
}
