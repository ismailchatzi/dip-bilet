import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { SupabaseClient } from "@supabase/supabase-js";

const PREF_KEY = "dipbilet.pushAlerts";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getPushPref(): Promise<boolean> {
  const v = await AsyncStorage.getItem(PREF_KEY);
  return v === "1";
}

export async function setPushPref(on: boolean) {
  await AsyncStorage.setItem(PREF_KEY, on ? "1" : "0");
}

export async function getNotificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Pref + sistem izni birlikte açık mı? */
export async function isPushAlertsEnabled() {
  const pref = await getPushPref();
  if (!pref) return false;
  const status = await getNotificationPermission();
  return status === "granted";
}

function easProjectId() {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
      ?.eas?.projectId
  );
}

/** Expo push token — EAS projectId şart; Expo Go (SDK 53+) desteklemez. */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const projectId = easProjectId();
    if (!projectId || projectId === "REPLACE_AFTER_EAS_INIT") {
      return null;
    }
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data || null;
  } catch {
    return null;
  }
}

export async function syncPushTokenToProfile(
  client: SupabaseClient,
  userId: string,
  email: string,
  on: boolean,
) {
  const token = on ? await getExpoPushToken() : null;
  const { error } = await client.from("profiles").upsert(
    {
      id: userId,
      email,
      push_alerts: on,
      expo_push_token: on ? token : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw error;
  return Boolean(on && token);
}

/**
 * Açınca izin iste; kalıcı redde ayarlara yönlendir.
 * Token sunucuya yazılır (EAS projectId yoksa tercihten kalır, push gidemez).
 */
export async function enablePushAlerts(
  client?: SupabaseClient | null,
  userId?: string,
  email?: string,
): Promise<{
  ok: boolean;
  status: string;
  openedSettings?: boolean;
  tokenSynced?: boolean;
}> {
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") {
    await setPushPref(true);
    let tokenSynced = false;
    if (client && userId) {
      tokenSynced = await syncPushTokenToProfile(
        client,
        userId,
        email ?? "",
        true,
      );
    }
    return { ok: true, status, tokenSynced };
  }
  if (status === "undetermined" || canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
    if (status === "granted") {
      await setPushPref(true);
      let tokenSynced = false;
      if (client && userId) {
        tokenSynced = await syncPushTokenToProfile(
          client,
          userId,
          email ?? "",
          true,
        );
      }
      return { ok: true, status, tokenSynced };
    }
  }
  await Linking.openSettings();
  return { ok: false, status, openedSettings: true };
}

export async function disablePushAlerts(
  client?: SupabaseClient | null,
  userId?: string,
  email?: string,
) {
  await setPushPref(false);
  if (client && userId) {
    await syncPushTokenToProfile(client, userId, email ?? "", false);
  }
}
