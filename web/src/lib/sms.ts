type SendSmsInput = {
  to: string;
  text: string;
};

function toE164(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("90") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+90${digits.slice(1)}`;
  if (digits.length === 10) return `+90${digits}`;
  return null;
}

export async function sendSms(
  input: SendSmsInput,
): Promise<{ ok: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!sid || !token || !from) {
    return { ok: false, error: "TWILIO_* env eksik" };
  }

  const to = toE164(input.to);
  if (!to) return { ok: false, error: "Geçersiz telefon" };

  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: input.text,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: err || `Twilio HTTP ${res.status}` };
  }

  return { ok: true };
}
