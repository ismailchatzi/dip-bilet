import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking } from "react-native";
import * as Notifications from "expo-notifications";

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

/**
 * Açınca izin iste; kalıcı redde ayarlara yönlendir.
 */
export async function enablePushAlerts(): Promise<{
  ok: boolean;
  status: string;
  openedSettings?: boolean;
}> {
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === "granted") {
    await setPushPref(true);
    return { ok: true, status };
  }
  if (status === "undetermined" || canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
    if (status === "granted") {
      await setPushPref(true);
      return { ok: true, status };
    }
  }
  await Linking.openSettings();
  return { ok: false, status, openedSettings: true };
}

export async function disablePushAlerts() {
  await setPushPref(false);
}
