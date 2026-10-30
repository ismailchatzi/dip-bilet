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

const LOGIN_PROMPT_KEY = "dipbilet.pushLoginPrompted";

/**
 * İlk girişte sistem “izin ver / verme” diyaloğu.
 * Reddedilirse ayarlara zorla göndermez; bir daha sormaz.
 * İzin zaten açıksa pref + token’ı senkronlar.
 */
export async function maybePromptPushOnLogin(
  client: SupabaseClient,
  userId: string,
  email: string,
): Promise<void> {
  const prompted = await AsyncStorage.getItem(LOGIN_PROMPT_KEY);
  if (prompted === "1") {
    const status = await getNotificationPermission();
    if (status === "granted" && (await getPushPref())) {
      await syncPushTokenToProfile(client, userId, email, true).catch(
        () => false,
      );
    }
    return;
  }

  await AsyncStorage.setItem(LOGIN_PROMPT_KEY, "1");
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();

  if (status === "granted") {
    await setPushPref(true);
    await syncPushTokenToProfile(client, userId, email, true).catch(
      () => false,
    );
    return;
  }

  if (status === "undetermined" || canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
    if (status === "granted") {
      await setPushPref(true);
      await syncPushTokenToProfile(client, userId, email, true).catch(
        () => false,
      );
    } else {
      await setPushPref(false);
    }
  }
}

export type PushOpenPayload = {
  screen?: string;
  dealId?: string;
};

const LAST_OPEN_KEY = "dipbilet.lastPushOpenId";

export function parsePushData(data: unknown): PushOpenPayload {
  if (!data || typeof data !== "object") return {};
  const d = data as Record<string, unknown>;
  return {
    screen: typeof d.screen === "string" ? d.screen : undefined,
    dealId: typeof d.dealId === "string" ? d.dealId : undefined,
  };
}

async function markPushOpenHandled(id: string) {
  const prev = await AsyncStorage.getItem(LAST_OPEN_KEY);
  if (prev === id) return false;
  await AsyncStorage.setItem(LAST_OPEN_KEY, id);
  return true;
}

/** Bildirime tıklanınca (soğuk açılış + uygulama içi). */
export function subscribePushOpens(
  handler: (payload: PushOpenPayload) => void,
) {
  const fromResponse = async (
    response: Notifications.NotificationResponse | null,
  ) => {
    if (!response) return;
    const id = response.notification.request.identifier;
    const fresh = await markPushOpenHandled(id);
    if (!fresh) return;
    handler(parsePushData(response.notification.request.content.data));
  };

  Notifications.getLastNotificationResponseAsync()
    .then(fromResponse)
    .catch(() => {});

  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    void fromResponse(r);
  });
  return () => sub.remove();
}
