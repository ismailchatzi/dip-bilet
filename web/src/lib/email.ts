type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "Dip Bilet <onboarding@resend.dev>";

  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY eksik" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: body || `Resend HTTP ${res.status}` };
  }

  return { ok: true };
}

export function farewellEmailContent() {
  const subject = "Hesap silme işlemin tamamlandı — Dip Bilet";
  const text = [
    "Merhaba,",
    "",
    "Hesap silme işlemin tamamlanmıştır.",
    "Seni tekrar aramızda görmek için sabırsızlanıyoruz.",
    "",
    "İstediğin zaman dipbilet.com üzerinden yeniden üye olabilirsin.",
    "",
    "Sevgiler,",
    "Dip Bilet",
  ].join("\n");

  const html = `
    <div style="font-family:Georgia,serif;line-height:1.6;color:#00153d;max-width:520px">
      <p>Merhaba,</p>
      <p><strong>Hesap silme işlemin tamamlanmıştır.</strong></p>
      <p>Seni tekrar aramızda görmek için sabırsızlanıyoruz.</p>
      <p>İstediğin zaman <a href="https://dipbilet.com">dipbilet.com</a> üzerinden yeniden üye olabilirsin.</p>
      <p style="margin-top:28px">Sevgiler,<br/>Dip Bilet</p>
    </div>
  `.trim();

  return { subject, text, html };
}
