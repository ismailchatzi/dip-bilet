import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Mobil zorunlu güncelleme. minVersion’dan düşük build açılışta engellenir.
 * Yeni mağaza sürümü yayınlanınca burayı ve app.json version’ı yükselt.
 */
export async function GET() {
  return NextResponse.json(
    {
      minVersion: "1.0.1",
      iosStoreUrl: "https://apps.apple.com/tr/app/dip-bilet/id6828823114",
      androidStoreUrl:
        "https://play.google.com/store/apps/details?id=com.dipbilet.app",
      message:
        "Dip Bilet’in yeni sürümü var. Devam etmek için uygulamayı güncelle.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
