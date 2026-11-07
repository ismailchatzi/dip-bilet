import Constants from "expo-constants";
import { BackHandler, Linking, Platform } from "react-native";
import { apiBase } from "./supabase";

export type AppVersionInfo = {
  minVersion: string;
  iosStoreUrl: string;
  androidStoreUrl: string;
  message: string;
};

function parseParts(v: string) {
  return v
    .trim()
    .split(".")
    .map((p) => {
      const n = Number.parseInt(p.replace(/\D/g, ""), 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** a < b → true */
export function isVersionBelow(current: string, minimum: string) {
  const a = parseParts(current);
  const b = parseParts(minimum);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

export function currentAppVersion() {
  return (
    Constants.expoConfig?.version?.trim() ||
    Constants.nativeAppVersion?.trim() ||
    "0.0.0"
  );
}

export async function fetchAppVersionInfo(): Promise<AppVersionInfo | null> {
  try {
    const res = await fetch(`${apiBase}/api/app-version`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<AppVersionInfo>;
    if (!json.minVersion) return null;
    return {
      minVersion: String(json.minVersion),
      iosStoreUrl:
        json.iosStoreUrl ||
        "https://apps.apple.com/tr/app/dip-bilet/id6828823114",
      androidStoreUrl:
        json.androidStoreUrl ||
        "https://play.google.com/store/apps/details?id=com.dipbilet.app",
      message:
        json.message ||
        "Dip Bilet’in yeni sürümü var. Devam etmek için uygulamayı güncelle.",
    };
  } catch {
    return null;
  }
}

export function storeUrlForPlatform(info: AppVersionInfo) {
  return Platform.OS === "ios" ? info.iosStoreUrl : info.androidStoreUrl;
}

export async function openStoreUpdate(info: AppVersionInfo) {
  const url = storeUrlForPlatform(info);
  try {
    await Linking.openURL(url);
  } catch {
    /* ignore */
  }
}

export function exitApp() {
  if (Platform.OS === "android") {
    BackHandler.exitApp();
    return;
  }
  // iOS resmi çıkış API’si yok — çağıran ekranı kapatmadan tutar.
}
