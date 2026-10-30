/**
 * Haftada bir (akşam) — “vitrini kontrol et” maili.
 * Havuzdan rastgele seçilir; kullanıcı onayladığı id’ler ACTIVE’te kalır.
 */

export type WeeklyVitrinNudge = {
  id: number;
  subject: string;
  /** Mail gövdesinin ana cümlesi (CTA’dan önce). */
  lead: string;
};

/** Tüm adaylar — sen seç; ACTIVE’e alınanlar gönderimde kullanılır. */
export const WEEKLY_VITRIN_NUDGE_POOL: WeeklyVitrinNudge[] = [
  {
    id: 1,
    subject: "Bu akşam vitrine bir bak",
    lead: "Haftanın dip fırsatları vitrinde olabilir. Beş dakikalık bir bakış yeter.",
  },
  {
    id: 2,
    subject: "Uçuş vitrinin seni bekliyor",
    lead: "Yeni kartlar gelmiş olabilir. Uygulamayı açıp vitrini kontrol etmeyi unutma.",
  },
  {
    id: 3,
    subject: "Dip fırsat kaçmasın",
    lead: "Bazı fiyatlar kısa süre duruyor. Bu akşam vitrine göz at, uygunsa yakala.",
  },
  {
    id: 4,
    subject: "Haftalık hatırlatma: vitrin",
    lead: "Hayalindeki şehirlerde yeni bir dip çıkmış olabilir. Vitrini bir kontrol et.",
  },
  {
    id: 5,
    subject: "Akşam molası: fırsat var mı?",
    lead: "Çayını al, uygulamayı aç. Vitrinde güzel bir uçuş kartı seni bekliyor olabilir.",
  },
  {
    id: 6,
    subject: "Vitrine uğrama vakti",
    lead: "Bu hafta izlediğin rotalarda hareket olmuş olabilir. Hızlı bir vitrin turu at.",
  },
  {
    id: 7,
    subject: "Yeni dip var mı diye bak",
    lead: "Biz taramaya devam ediyoruz; sen de vitrini açıp güncel kartlara bak.",
  },
  {
    id: 8,
    subject: "Uygulamada seni bekleyenler var",
    lead: "Seçtiğin şehirler için vitrin yenilenmiş olabilir. Bir bakışla kaçırma.",
  },
  {
    id: 9,
    subject: "Haftanın vitrin turu",
    lead: "Kısa bir tur: vitrini aç, fiyatları tara, beğendiğin kartı incele.",
  },
  {
    id: 10,
    subject: "Fırsat avına devam?",
    lead: "Akşam saatleri iyi bir kontrol zamanı. Vitrinde hâlâ güzel uçuşlar olabilir.",
  },
  {
    id: 11,
    subject: "İstanbul’dan dip uçuşlar",
    lead: "IST ve SAW kalkışlı güncel fırsatlar vitrinde. Uygulamadan bir göz at.",
  },
  {
    id: 12,
    subject: "Kartlar değişmiş olabilir",
    lead: "Vitrin canlı; eski fiyat kalmaz, yeni dip gelir. Bu akşam bir kontrol et.",
  },
  {
    id: 13,
    subject: "Hayal rotana bakmayı unutma",
    lead: "Alarm kurduğun veya seçtiğin destinasyonlarda yeni bir fırsat çıkmış olabilir.",
  },
  {
    id: 14,
    subject: "Küçük bir hatırlatma",
    lead: "Spam değil, nazik bir dokunuş: vitrini açıp güzel bir uçuş var mı bak.",
  },
  {
    id: 15,
    subject: "Bu haftanın vitrini hazır",
    lead: "Tarama sürüyor, kartlar güncelleniyor. Uygulamayı açıp vitrini ziyaret et.",
  },
  {
    id: 16,
    subject: "Akşam vitrin check’i",
    lead: "Haftada bir yeter: vitrine gir, fiyatları gör, işine yarayanı kaydet veya incele.",
  },
];

/** Onaylı mesajlar (11 ve 14 elendi). */
export const WEEKLY_VITRIN_NUDGE_ACTIVE: number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 16,
];

export function weeklyNudgeById(id: number) {
  return WEEKLY_VITRIN_NUDGE_POOL.find((m) => m.id === id) ?? null;
}

export function activeWeeklyNudges() {
  if (WEEKLY_VITRIN_NUDGE_ACTIVE.length === 0) {
    return [...WEEKLY_VITRIN_NUDGE_POOL];
  }
  return WEEKLY_VITRIN_NUDGE_POOL.filter((m) =>
    WEEKLY_VITRIN_NUDGE_ACTIVE.includes(m.id),
  );
}

/** Aktif havuzdan rastgele bir mesaj. */
export function pickWeeklyVitrinNudge(seed?: number) {
  const pool = activeWeeklyNudges();
  if (pool.length === 0) return null;
  const i =
    typeof seed === "number" && Number.isFinite(seed)
      ? Math.abs(Math.floor(seed)) % pool.length
      : Math.floor(Math.random() * pool.length);
  return pool[i]!;
}
