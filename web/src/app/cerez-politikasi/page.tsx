import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "Çerez Politikası — Dip Bilet",
};

export default function CerezPolitikasiPage() {
  return (
    <LegalShell title="Çerez Politikası">
      <p>
        Dip Bilet, site deneyimini yürütmek ve iyileştirmek için çerezler ve benzeri
        teknolojiler kullanabilir.
      </p>

      <h2>1. Çerez nedir?</h2>
      <p>
        Çerezler, tarayıcınızda saklanan küçük metin dosyalarıdır. Oturum açma,
        tercih hatırlama ve istatistik için kullanılabilir.
      </p>

      <h2>2. Kullandığımız türler</h2>
      <ul>
        <li>
          <strong>Zorunlu:</strong> Giriş, güvenlik, temel işlevler
        </li>
        <li>
          <strong>İşlevsel:</strong> Dil / tercih ayarları
        </li>
        <li>
          <strong>Analitik:</strong> Trafik ve kullanım ölçümü (varsa)
        </li>
        <li>
          <strong>Pazarlama:</strong> Yalnızca açık rıza ile (varsa)
        </li>
      </ul>

      <h2>3. Yönetim</h2>
      <p>
        Tarayıcı ayarlarından çerezleri silebilir veya engelleyebilirsiniz. Zorunlu
        çerezler kapatılırsa bazı özellikler çalışmayabilir.
      </p>

      <h2>4. Güncelleme</h2>
      <p>
        Bu politika güncellenebilir. Güncel sürüm her zaman bu sayfada yayımlanır.
      </p>
    </LegalShell>
  );
}
