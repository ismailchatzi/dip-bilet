const MIN_PASSWORD_LENGTH = 10;

/** Have I Been Pwned k-anonymity — site ile aynı; API susarsa kayıt kapanmasın. */
async function passwordIsPwned(password: string): Promise<boolean> {
  try {
    const bytes = new Uint8Array(
      await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password)),
    );
    const hex = [...bytes]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const prefix = hex.slice(0, 5);
    const suffix = hex.slice(5);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text
      .split(/\r?\n/)
      .some((line) => line.split(":")[0]?.trim() === suffix);
  } catch {
    return false;
  }
}

export async function newPasswordError(
  password: string,
): Promise<string | null> {
  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalı.`;
  }
  if (await passwordIsPwned(password)) {
    return "Bu şifre sızıntılarda görülmüş. Başka bir şifre seç.";
  }
  return null;
}
