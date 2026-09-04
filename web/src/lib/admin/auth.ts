import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "dip_admin";

export function adminPasswordConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD?.trim());
}

export function adminSessionToken(): string | null {
  const pwd = process.env.ADMIN_PASSWORD?.trim();
  if (!pwd) return null;
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() || pwd;
  return createHmac("sha256", secret).update("dip-admin-v1").digest("hex");
}

export function verifyAdminPassword(input: string) {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected) return false;
  try {
    const a = createHmac("sha256", "dip-admin-pwd").update(input).digest();
    const b = createHmac("sha256", "dip-admin-pwd").update(expected).digest();
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyAdminSessionToken(token: string | undefined) {
  const expected = adminSessionToken();
  if (!expected || !token) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function isAdminAuthed() {
  const jar = await cookies();
  return verifyAdminSessionToken(jar.get(ADMIN_COOKIE)?.value);
}

export const adminCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};
