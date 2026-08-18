import { createHash } from "crypto";

export function otpPepper(): string | null {
  const secret = process.env.CRON_SECRET?.trim();
  return secret || null;
}

export function hashOtpCode(code: string, userId: string, pepper: string) {
  return createHash("sha256")
    .update(`${pepper}:${userId}:${code}`)
    .digest("hex");
}

export function hashOtpIp(ip: string, pepper: string) {
  return createHash("sha256").update(`${pepper}:ip:${ip}`).digest("hex");
}

export function clientIp(request: Request) {
  const nf = request.headers.get("x-nf-client-connection-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return nf || forwarded || real || "";
}
