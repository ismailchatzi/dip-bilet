/**
 * Haftada bir (akşam) — “vitrini kontrol et” mail + push.
 * Havuzdan rastgele; ACTIVE id’ler kullanılır.
 */
import { sendEmail } from "@/lib/email";
import { sendExpoPush } from "@/lib/expo-push";
import { siteOrigin } from "@/lib/deal-display";
import type { SupabaseClient } from "@supabase/supabase-js";

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

export function weeklyVitrinNudgeEmail(nudge: WeeklyVitrinNudge) {
  const origin = siteOrigin();
  const href = `${origin}/firsatlarim`;
  const subject = nudge.subject;
  const text = [
    "Merhaba,",
    "",
    nudge.lead,
    "",
    `Vitrine git: ${href}`,
    "",
    "Sevgiler,",
    "Dip Bilet",
  ].join("\n");
  const html = `
    <div style="font-family:Georgia,serif;line-height:1.6;color:#00153d;max-width:520px">
      <p>Merhaba,</p>
      <p>${nudge.lead}</p>
      <p style="margin:24px 0">
        <a href="${href}" style="display:inline-block;background:#00153d;color:#fff;font-weight:700;padding:12px 22px;border-radius:8px;text-decoration:none">Vitrine git</a>
      </p>
      <p style="margin-top:28px">Sevgiler,<br/>Dip Bilet</p>
    </div>
  `.trim();
  return { subject, text, html };
}

export function weeklyVitrinNudgePush(nudge: WeeklyVitrinNudge) {
  return {
    title: nudge.subject,
    body: nudge.lead,
    data: { screen: "vitrin" },
  };
}

export type WeeklyNudgeDispatchResult = {
  profiles: number;
  mailed: number;
  pushed: number;
  nudgeId: number | null;
};

/**
 * email_alerts / push_alerts açık üyelere haftalık hatırlatma.
 * Aynı koşuda herkese aynı havuz mesajı (destek için).
 */
export async function dispatchWeeklyVitrinNudges(
  admin: SupabaseClient,
  opts: { send?: boolean } = {},
): Promise<WeeklyNudgeDispatchResult> {
  const send = opts.send !== false;
  const nudge = pickWeeklyVitrinNudge();
  if (!nudge) {
    return { profiles: 0, mailed: 0, pushed: 0, nudgeId: null };
  }

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("email, email_alerts, push_alerts, expo_push_token");
  if (error) throw new Error(error.message);

  const rows = profiles ?? [];
  let mailed = 0;
  let pushed = 0;
  const pushBatch: {
    to: string;
    title: string;
    body: string;
    data: Record<string, string>;
    sound: "default";
  }[] = [];
  const mailContent = weeklyVitrinNudgeEmail(nudge);
  const pushContent = weeklyVitrinNudgePush(nudge);

  for (const p of rows) {
    const email = typeof p.email === "string" ? p.email.trim() : "";
    const wantEmail = p.email_alerts !== false && Boolean(email);
    const token =
      typeof p.expo_push_token === "string" ? p.expo_push_token.trim() : "";
    const wantPush =
      Boolean(p.push_alerts) && token.startsWith("ExponentPushToken");

    if (!wantEmail && !wantPush) continue;

    console.log(
      JSON.stringify({
        tag: "weekly-nudge",
        mode: send ? "send" : "dry",
        nudgeId: nudge.id,
        email: email || null,
        mail: wantEmail,
        push: wantPush,
      }),
    );

    if (!send) continue;

    if (wantEmail) {
      const mail = await sendEmail({
        to: email,
        subject: mailContent.subject,
        html: mailContent.html,
        text: mailContent.text,
      });
      if (mail.ok) mailed += 1;
      else {
        console.log(
          JSON.stringify({
            tag: "weekly-nudge-mail-fail",
            email,
            error: mail.error,
          }),
        );
      }
    }

    if (wantPush) {
      pushBatch.push({
        to: token,
        title: pushContent.title,
        body: pushContent.body,
        data: pushContent.data,
        sound: "default",
      });
    }
  }

  for (let i = 0; i < pushBatch.length; i += 100) {
    const chunk = pushBatch.slice(i, i + 100);
    const res = await sendExpoPush(chunk);
    if (res.ok) pushed += chunk.length;
    else {
      console.log(
        JSON.stringify({
          tag: "weekly-nudge-push-fail",
          error: res.error,
          count: chunk.length,
        }),
      );
    }
  }

  return {
    profiles: rows.length,
    mailed,
    pushed,
    nudgeId: nudge.id,
  };
}
