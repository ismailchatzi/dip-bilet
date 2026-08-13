/** TR cep → E.164 (+90…) */
export function normalizeTrPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) {
    return `+90${digits.slice(1)}`;
  }
  if (digits.length === 10) return `+90${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

/** 905xxxxxxxxx */
export function toGsmNo(e164: string) {
  const digits = e164.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length === 12) return digits;
  if (digits.length === 10) return `90${digits}`;
  return digits;
}
