import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Calistoga_400Regular } from "@expo-google-fonts/calistoga";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import type { Session } from "@supabase/supabase-js";
import { apiBase, supabase } from "./src/supabase";
import { iataFromLabel, partnerLinks } from "./src/booking";
import {
  cityLowDeal,
  cityName,
  dateLabel,
  dealDateChoices,
  dealMatchesDests,
  dealMatchesFlightTypes,
  dealMatchesOrigins,
  destCode,
  discountPercent,
  type Deal,
  type FlightTypeFilter,
  familyLowPrice,
  fetchShowcaseDeals,
  isCheaperFreshDateOption,
  isOldDateOption,
  isOldShowcaseDeal,
  money,
  originCode,
  rangeLabel,
  resolveAirline,
  screenPrice,
  stopsLabel,
} from "./src/deals";
import { DREAM_DEST_CATALOG, destLabel } from "./src/destinations";
import {
  fetchActivities,
  fetchCars,
  fetchHotels,
  type ExtraCard,
} from "./src/extras";
import {
  disablePushAlerts,
  enablePushAlerts,
  getNotificationPermission,
  isPushAlertsEnabled,
  setPushPref,
  syncPushTokenToProfile,
} from "./src/notifications";
import { newPasswordError } from "./src/password";
import { cardPhotoUrls } from "./src/photos";
import {
  createPriceAlert,
  deletePriceAlert,
  listPriceAlerts,
  loadProfilePrefs,
  type PriceAlertRow,
  setEmailAlerts,
  toggleDreamDest,
} from "./src/profile";

WebBrowser.maybeCompleteAuthSession();
SplashScreen.preventAutoHideAsync().catch(() => {});

const NAVY = "#04193f";
const BRAND = "dipbilet.com";
const logo = require("./assets/icon.png");

const ORIGIN_AIRPORTS = [
  { code: "IST", label: "İstanbul Havalimanı (IST)" },
  { code: "SAW", label: "Sabiha Gökçen (SAW)" },
];

type AppScreen = "vitrin" | "deal" | "account" | "account-dest" | "account-flight" | "account-settings";

function appRedirectUri() {
  return makeRedirectUri({
    scheme: "dipbilet",
    path: "auth/callback",
  });
}

function loginMessage(raw: string) {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid") && lower.includes("credential")) {
    return "E-posta veya şifre hatalı.";
  }
  if (lower.includes("email not confirmed")) {
    return "E-posta henüz onaylanmamış. Gelen kutundaki linke tıkla.";
  }
  if (lower.includes("user already registered")) {
    return "Bu e-posta ile zaten kayıt var. Giriş yapmayı dene.";
  }
  return raw || "Giriş yapılamadı.";
}

export default function App() {
  const [fontsLoaded] = useFonts({ Calistoga_400Regular });
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [screen, setScreen] = useState<AppScreen>("vitrin");
  const [allDeals, setAllDeals] = useState<Deal[]>([]);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setDeal(null);
        setScreen("vitrin");
        setAllDeals([]);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const handle = (url: string) => {
      if (url.includes("auth/callback") || url.includes("access_token") || url.includes("code=")) {
        createSessionFromUrl(url).catch(() => {});
      }
    };
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    Linking.getInitialURL().then((url) => {
      if (url) handle(url);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!ready || !fontsLoaded) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [ready, fontsLoaded]);

  if (!ready || !fontsLoaded) {
    return (
      <View style={styles.boot}>
        <View style={styles.bootCenter}>
          <Image source={logo} style={styles.bootLogo} />
        </View>
        <Text style={styles.bootBrand}>dipbilet.com</Text>
      </View>
    );
  }

  if (!supabase) {
    return (
      <View style={styles.boot}>
        <Text style={styles.errorLight}>Uygulama ayarı eksik.</Text>
      </View>
    );
  }

  const client = supabase;
  const loggedIn = !!session;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={loggedIn ? styles.screen : styles.loginScreen}>
        <StatusBar style={loggedIn ? "dark" : "light"} />
        {!session ? (
          <LoginScreen />
        ) : screen === "account" ||
          screen === "account-dest" ||
          screen === "account-flight" ||
          screen === "account-settings" ? (
          <AccountFlow
            screen={screen}
            session={session}
            onScreen={setScreen}
            onLogout={() => client.auth.signOut()}
          />
        ) : deal ? (
          <DealScreen
            deal={deal}
            allDeals={allDeals}
            session={session}
            onBack={() => {
              setDeal(null);
              setScreen("vitrin");
            }}
          />
        ) : (
          <VitrinScreen
            onOpen={(d) => {
              setDeal(d);
              setScreen("deal");
            }}
            onAccount={() => setScreen("account")}
            onDeals={setAllDeals}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function BrandTitle() {
  return <Text style={styles.brand}>{BRAND}</Text>;
}

function SiteFooter() {
  return (
    <Pressable
      style={styles.siteFooter}
      onPress={() => Linking.openURL("https://dipbilet.com")}
    >
      <Text style={styles.siteFooterText}>dipbilet.com</Text>
    </Pressable>
  );
}

function LegalLinks({ light }: { light?: boolean }) {
  const color = light ? "#c5d0e6" : "#5a6a86";
  return (
    <View style={styles.legalRow}>
      <Pressable onPress={() => Linking.openURL("https://dipbilet.com/gizlilik")}>
        <Text style={[styles.legalLink, { color }]}>Gizlilik</Text>
      </Pressable>
      <Text style={[styles.legalSep, { color }]}>·</Text>
      <Pressable
        onPress={() => Linking.openURL("https://dipbilet.com/uyelik-sozlesmesi")}
      >
        <Text style={[styles.legalLink, { color }]}>Üyelik sözleşmesi</Text>
      </Pressable>
    </View>
  );
}

function AccountIcon({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={NAVY}
        d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2.25c-3.6 0-7.5 1.8-7.5 4.5V20h15v-1.25c0-2.7-3.9-4.5-7.5-4.5Z"
      />
    </Svg>
  );
}

function GoogleIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <Path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 36 26.8 37 24 37c-5.2 0-9.6-3.3-11.2-7.9l-6.6 5.1C9.7 40.2 16.3 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l.1.1 6.2 5.2C39.2 37.2 44 32 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </Svg>
  );
}

function authParamsFromUrl(url: string) {
  const hash = url.includes("#") ? url.split("#")[1] : "";
  const query = url.includes("?") ? url.split("?")[1]?.split("#")[0] : "";
  const params = new URLSearchParams(hash || query || "");
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    code: params.get("code"),
  };
}

async function createSessionFromUrl(url: string) {
  if (!supabase) return;
  const { access_token, refresh_token, code } = authParamsFromUrl(url);
  if (access_token && refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
    return;
  }
  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }
}

function LoginScreen() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next: "login" | "signup" | "forgot") {
    setMode(next);
    setError("");
    setInfo("");
    setPassword2("");
  }

  async function submitLogin() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    setInfo("");
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (loginError) setError(loginMessage(loginError.message));
  }

  async function submitSignup() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (password !== password2) {
        setError("Şifreler eşleşmiyor.");
        return;
      }
      const pwdError = await newPasswordError(password);
      if (pwdError) {
        setError(pwdError);
        return;
      }
      const { error: signError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${apiBase}/auth/callback?flow=confirm`,
        },
      });
      if (signError) throw signError;
      setInfo(
        "Kayıt alındı. E-posta kutunu kontrol et; onay linkine tıklayınca giriş yapabilirsin.",
      );
      setMode("login");
      setPassword("");
      setPassword2("");
    } catch (e) {
      setError(
        loginMessage(e instanceof Error ? e.message : "Kayıt yapılamadı."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendReset() {
    if (!supabase) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Şifre sıfırlama için e-posta yaz.");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const redirectTo = `${apiBase}/auth/callback?flow=recovery&next=/sifre-yenile`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        trimmed,
        { redirectTo },
      );
      if (resetError) throw resetError;
      setInfo(
        "Sıfırlama maili gönderildi. Gelen kutunu (ve spam’i) kontrol et; link siteye açılır.",
      );
    } catch (e) {
      setError(
        loginMessage(
          e instanceof Error ? e.message : "Sıfırlama maili gönderilemedi.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    if (!supabase) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const redirectTo = appRedirectUri();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (oauthError) throw oauthError;
      if (!data.url) throw new Error("Google girişi açılamadı.");
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success" && result.url) {
        await createSessionFromUrl(result.url);
      }
    } catch (e) {
      setError(loginMessage(e instanceof Error ? e.message : "Google girişi başarısız."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.login}
      keyboardShouldPersistTaps="handled"
    >
      <Image source={logo} style={styles.loginLogo} />
      <BrandTitle />
      {mode === "forgot" ? (
        <Text style={styles.forgotHint}>
          E-posta adresini yaz; sıfırlama linkini mailine gönderelim.
        </Text>
      ) : null}
      {mode === "signup" ? (
        <Text style={styles.forgotHint}>
          Ücretsiz üye ol — onay mailindeki linke tıklayınca giriş yapabilirsin.
        </Text>
      ) : null}
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="E-posta"
        placeholderTextColor="#9aa6bd"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />
      {mode === "login" || mode === "signup" ? (
        <TextInput
          autoComplete={mode === "signup" ? "new-password" : "password"}
          placeholder="Şifre"
          placeholderTextColor="#9aa6bd"
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
      ) : null}
      {mode === "signup" ? (
        <TextInput
          autoComplete="new-password"
          placeholder="Şifre tekrar"
          placeholderTextColor="#9aa6bd"
          secureTextEntry
          style={styles.input}
          value={password2}
          onChangeText={setPassword2}
        />
      ) : null}
      {mode === "login" ? (
        <Pressable
          style={styles.forgotWrap}
          onPress={() => switchMode("forgot")}
          disabled={busy}
        >
          <Text style={styles.forgotLink}>Şifreni mi unuttun?</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.errorOnNavy}>{error}</Text> : null}
      {info ? <Text style={styles.infoOnNavy}>{info}</Text> : null}
      {mode === "login" ? (
        <>
          <Pressable
            style={[styles.button, busy && styles.buttonOff]}
            disabled={busy}
            onPress={submitLogin}
          >
            <Text style={styles.buttonText}>
              {busy ? "Giriliyor…" : "Giriş yap"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.googleButton, busy && styles.buttonOff]}
            disabled={busy}
            onPress={googleLogin}
          >
            <View style={styles.googleIconWrap}>
              <GoogleIcon />
            </View>
            <Text style={styles.googleButtonText}>Google ile giriş yap</Text>
          </Pressable>
          <Pressable
            style={styles.forgotWrap}
            onPress={() => switchMode("signup")}
            disabled={busy}
          >
            <Text style={styles.forgotLink}>Hesabın yok mu? Üye ol</Text>
          </Pressable>
        </>
      ) : null}
      {mode === "signup" ? (
        <>
          <Pressable
            style={[styles.button, busy && styles.buttonOff]}
            disabled={busy}
            onPress={submitSignup}
          >
            <Text style={styles.buttonText}>
              {busy ? "Kaydediliyor…" : "Üye ol"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.googleButton, busy && styles.buttonOff]}
            disabled={busy}
            onPress={googleLogin}
          >
            <View style={styles.googleIconWrap}>
              <GoogleIcon />
            </View>
            <Text style={styles.googleButtonText}>Google ile üye ol</Text>
          </Pressable>
          <Pressable
            style={styles.forgotWrap}
            onPress={() => switchMode("login")}
            disabled={busy}
          >
            <Text style={styles.forgotLink}>Zaten üye misin? Giriş yap</Text>
          </Pressable>
        </>
      ) : null}
      {mode === "forgot" ? (
        <>
          <Pressable
            style={[styles.button, busy && styles.buttonOff]}
            disabled={busy}
            onPress={sendReset}
          >
            <Text style={styles.buttonText}>
              {busy ? "Gönderiliyor…" : "Sıfırlama linki gönder"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.forgotWrap}
            onPress={() => switchMode("login")}
            disabled={busy}
          >
            <Text style={styles.forgotLink}>Girişe dön</Text>
          </Pressable>
        </>
      ) : null}
      <LegalLinks light />
      <SiteFooter />
    </ScrollView>
  );
}

function VitrinScreen({
  onOpen,
  onAccount,
  onDeals,
}: {
  onOpen: (deal: Deal) => void;
  onAccount: () => void;
  onDeals: (deals: Deal[]) => void;
}) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [origins, setOrigins] = useState(["IST", "SAW"]);
  const [dests, setDests] = useState<string[]>([]);
  const [flightTypes, setFlightTypes] = useState<FlightTypeFilter[]>([]);
  const [boundMin, setBoundMin] = useState(0);
  const [boundMax, setBoundMax] = useState(0);
  const [priceMin, setPriceMin] = useState(0);
  const [priceMax, setPriceMax] = useState(0);
  const [filterOpen, setFilterOpen] = useState<"origin" | "price" | "dest" | "type" | null>(null);
  const [dreamCodes, setDreamCodes] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError("");
    if (!supabase) {
      setError("Oturum kapandı. Çıkıp tekrar gir.");
      setDeals([]);
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setError("Oturum kapandı. Çıkıp tekrar gir.");
      setDeals([]);
      return;
    }
    try {
      const next = await fetchShowcaseDeals(supabase);
      setDeals(next);
      onDeals(next);
      const prices = next.map((d) => d.price).filter((n) => n > 0);
      if (prices.length > 0) {
        const lo = Math.floor(Math.min(...prices));
        const hi = Math.ceil(Math.max(...prices));
        setBoundMin(lo);
        setBoundMax(hi);
        setPriceMin(lo);
        setPriceMax(hi);
      }
      const prefs = await loadProfilePrefs(supabase, session.user.id);
      setDreamCodes(prefs.destinationCodes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Vitrin açılmadı.");
      setDeals([]);
      onDeals([]);
    }
  }, [onDeals]);

  useEffect(() => {
    load()
      .catch(() => setError("Vitrin açılmadı."))
      .finally(() => setLoading(false));
  }, [load]);

  const destOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of deals) {
      const code = destCode(d);
      if (!code) continue;
      map.set(code, cityName(d));
    }
    for (const code of dreamCodes) {
      if (!map.has(code)) map.set(code, code);
    }
    return [...map.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  }, [deals, dreamCodes]);

  const visible = useMemo(
    () =>
      deals.filter(
        (d) =>
          dealMatchesOrigins(d, origins) &&
          dealMatchesDests(d, dests) &&
          dealMatchesFlightTypes(d, flightTypes) &&
          d.price >= priceMin &&
          d.price <= priceMax,
      ),
    [deals, origins, dests, flightTypes, priceMin, priceMax],
  );

  const canClear =
    origins.length < ORIGIN_AIRPORTS.length ||
    dests.length > 0 ||
    flightTypes.length > 0 ||
    (boundMax > boundMin && (priceMin > boundMin || priceMax < boundMax));

  function clearFilters() {
    setOrigins(ORIGIN_AIRPORTS.map((a) => a.code));
    setDests([]);
    setFlightTypes([]);
    setPriceMin(boundMin);
    setPriceMax(boundMax);
    setFilterOpen(null);
  }

  return (
    <View style={styles.flex}>
      <View style={styles.top}>
        <View style={styles.topBrand}>
          <Image source={logo} style={styles.topLogo} />
          <Text style={styles.brandSmall}>Dip Bilet</Text>
        </View>
        <Pressable
          onPress={onAccount}
          style={styles.accountBtn}
          accessibilityLabel="Hesap"
        >
          <AccountIcon />
        </Pressable>
      </View>

      <View style={styles.filterBar}>
        <FilterPill
          label="Kalkış"
          open={filterOpen === "origin"}
          onPress={() => setFilterOpen(filterOpen === "origin" ? null : "origin")}
        />
        <FilterPill
          label="Fiyat"
          open={filterOpen === "price"}
          onPress={() => setFilterOpen(filterOpen === "price" ? null : "price")}
        />
        <FilterPill
          label="Destinasyon"
          open={filterOpen === "dest"}
          onPress={() => setFilterOpen(filterOpen === "dest" ? null : "dest")}
        />
        <FilterPill
          label="Uçuş tipi"
          open={filterOpen === "type"}
          onPress={() => setFilterOpen(filterOpen === "type" ? null : "type")}
        />
        {canClear ? (
          <Pressable style={styles.clearPill} onPress={clearFilters}>
            <Text style={styles.clearPillText}>Temizle</Text>
          </Pressable>
        ) : null}
      </View>

      {filterOpen ? (
        <ScrollView style={styles.filterPanel} nestedScrollEnabled>
          {filterOpen === "origin"
            ? ORIGIN_AIRPORTS.map((a) => (
                <Pressable
                  key={a.code}
                  style={styles.filterRow}
                  onPress={() => {
                    setOrigins((prev) => {
                      if (prev.includes(a.code)) {
                        const next = prev.filter((c) => c !== a.code);
                        return next.length === 0
                          ? ORIGIN_AIRPORTS.map((x) => x.code)
                          : next;
                      }
                      return [...prev, a.code];
                    });
                  }}
                >
                  <Text style={styles.filterRowText}>{a.label}</Text>
                  <Text style={styles.check}>
                    {origins.includes(a.code) ? "✓" : ""}
                  </Text>
                </Pressable>
              ))
            : null}
          {filterOpen === "price" ? (
            <View style={styles.priceFilter}>
              <Text style={styles.filterHint}>
                ${boundMin} – ${boundMax}
              </Text>
              <View style={styles.priceInputs}>
                <TextInput
                  style={styles.priceInput}
                  keyboardType="number-pad"
                  value={String(priceMin)}
                  onChangeText={(t) => {
                    const n = Number(t);
                    if (!Number.isFinite(n)) return;
                    setPriceMin(Math.min(Math.max(n, boundMin), priceMax));
                  }}
                />
                <Text style={styles.filterHint}>–</Text>
                <TextInput
                  style={styles.priceInput}
                  keyboardType="number-pad"
                  value={String(priceMax)}
                  onChangeText={(t) => {
                    const n = Number(t);
                    if (!Number.isFinite(n)) return;
                    setPriceMax(Math.max(Math.min(n, boundMax), priceMin));
                  }}
                />
              </View>
            </View>
          ) : null}
          {filterOpen === "dest" ? (
            destOptions.length === 0 ? (
              <Text style={styles.filterHint}>Henüz destinasyon yok.</Text>
            ) : (
              destOptions.map((d) => (
                <Pressable
                  key={d.code}
                  style={styles.filterRow}
                  onPress={() =>
                    setDests((prev) =>
                      prev.includes(d.code)
                        ? prev.filter((c) => c !== d.code)
                        : [...prev, d.code],
                    )
                  }
                >
                  <Text style={styles.filterRowText}>
                    {d.name} ({d.code})
                  </Text>
                  <Text style={styles.check}>
                    {dests.includes(d.code) ? "✓" : ""}
                  </Text>
                </Pressable>
              ))
            )
          ) : null}
          {filterOpen === "type" ? (
            <>
              {(
                [
                  ["domestic", "Yurt içi"],
                  ["international", "Yurt dışı"],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  style={styles.filterRow}
                  onPress={() =>
                    setFlightTypes((prev) =>
                      prev.includes(key)
                        ? prev.filter((t) => t !== key)
                        : [...prev, key],
                    )
                  }
                >
                  <Text style={styles.filterRowText}>{label}</Text>
                  <Text style={styles.check}>
                    {flightTypes.includes(key) ? "✓" : ""}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : null}
        </ScrollView>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={NAVY} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            visible.length === 0 ? styles.flexGrow : styles.list
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load()
                  .catch(() => setError("Vitrin açılmadı."))
                  .finally(() => setRefreshing(false));
              }}
            />
          }
          ListEmptyComponent={
            <Text style={styles.muted}>{error || "Vitrinde kart yok."}</Text>
          }
          ListHeaderComponent={
            error && visible.length > 0 ? (
              <Text style={styles.error}>{error}</Text>
            ) : undefined
          }
          ListFooterComponent={<SiteFooter />}
          renderItem={({ item }) => (
            <DealRow deal={item} onPress={() => onOpen(item)} />
          )}
        />
      )}
    </View>
  );
}

function FilterPill({
  label,
  open,
  onPress,
}: {
  label: string;
  open: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.filterPill, open && styles.filterPillOn]}
      onPress={onPress}
      hitSlop={4}
    >
      <Text
        numberOfLines={1}
        style={[styles.filterPillText, open && styles.filterPillTextOn]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DealRow({ deal, onPress }: { deal: Deal; onPress: () => void }) {
  const price = screenPrice(deal.price);
  const was =
    typeof deal.averagePrice === "number" ? Math.round(deal.averagePrice) : null;
  const off = discountPercent(deal);
  const oldDeal = isOldShowcaseDeal(deal);
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View>
        {deal.cardImage ? (
          <Image source={{ uri: deal.cardImage }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]} />
        )}
        {oldDeal ? (
          <View style={styles.cardStampWrap} pointerEvents="none">
            <Text style={styles.cardStamp}>eski fırsat</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.city}>{cityName(deal)}</Text>
        <Text style={styles.trip}>{rangeLabel(deal.outboundDate, deal.returnDate)}</Text>
        <Text style={styles.priceLine}>
          <Text style={styles.price}>{money(price, deal.currency)}</Text>
          {was != null ? <Text style={styles.was}>  {money(was, deal.currency)}</Text> : null}
          {off != null ? <Text style={styles.off}>  %{off}</Text> : null}
        </Text>
        <Text style={styles.meta}>
          {originCode(deal)}
          {stopsLabel(deal.stops) ? ` · ${stopsLabel(deal.stops)}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

function PhotoGallery({ urls }: { urls: string[] }) {
  const win = useWindowDimensions();
  const [width, setWidth] = useState(win.width);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const list = (urls.length > 0 ? urls : [""]).filter((u) => u && !failed[u]);
  const slides = list.length > 0 ? list : [""];

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / Math.max(width, 1));
    if (next !== index && next >= 0 && next < slides.length) setIndex(next);
  }

  return (
    <>
      <View
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w > 0 && w !== width) setWidth(w);
        }}
      >
        <ScrollView
          horizontal
          pagingEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          {slides.map((uri, i) => (
            <Pressable
              key={`${uri}-${i}`}
              onPress={() => uri && setLightbox(true)}
              style={{ width }}
            >
              {uri ? (
                <Image
                  source={{ uri }}
                  style={[styles.hero, { width }]}
                  resizeMode="cover"
                  onError={() =>
                    setFailed((prev) => ({ ...prev, [uri]: true }))
                  }
                />
              ) : (
                <View style={[styles.hero, styles.photoEmpty, { width }]} />
              )}
            </Pressable>
          ))}
        </ScrollView>
        {slides.length > 1 ? (
          <View style={styles.dots} pointerEvents="none">
            {slides.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === index && styles.dotOn]}
              />
            ))}
          </View>
        ) : null}
      </View>
      <Modal visible={lightbox} transparent animationType="fade">
        <View style={styles.lightbox}>
          <Pressable style={styles.lightboxClose} onPress={() => setLightbox(false)}>
            <Text style={styles.lightboxCloseText}>✕</Text>
          </Pressable>
          <ScrollView
            horizontal
            pagingEnabled
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: index * width, y: 0 }}
          >
            {slides.map((uri, i) =>
              uri ? (
                <Image
                  key={`lb-${uri}-${i}`}
                  source={{ uri }}
                  style={{ width, height: win.height }}
                  resizeMode="contain"
                />
              ) : (
                <View key={`lb-empty-${i}`} style={{ width }} />
              ),
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function ExtrasStrip({
  title,
  cards,
  loading,
}: {
  title: string;
  cards: ExtraCard[];
  loading: boolean;
}) {
  if (!loading && cards.length === 0) return null;
  return (
    <View style={styles.extraBlock}>
      <Text style={styles.extraTitle}>{title}</Text>
      {loading ? (
        <ActivityIndicator color={NAVY} style={{ marginVertical: 12 }} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.extraList}
        >
          {cards.map((item) => (
            <Pressable
              key={item.id}
              style={styles.extraCard}
              onPress={() => Linking.openURL(item.url)}
            >
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.extraPhoto} />
              ) : (
                <View style={[styles.extraPhoto, styles.photoEmpty]} />
              )}
              <Text style={styles.extraName} numberOfLines={2}>
                {item.title}
              </Text>
              {item.price ? (
                <Text style={styles.extraPrice}>{item.price}</Text>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function DealScreen({
  deal,
  allDeals,
  session,
  onBack,
}: {
  deal: Deal;
  allDeals: Deal[];
  session: Session;
  onBack: () => void;
}) {
  // Site ile aynı: eşik üstü tarihler düşer; hero (kart fiyatı) her zaman başta
  const choices = useMemo(() => dealDateChoices(deal), [deal]);
  const heroKey = `${deal.outboundDate ?? ""}|${deal.returnDate ?? ""}`;
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const list = dealDateChoices(deal);
    const i = list.findIndex(
      (c) => `${c.outboundDate}|${c.returnDate}` === heroKey,
    );
    setIndex(i >= 0 ? i : 0);
    // Yalnız kart değişince hero’ya dön; kullanıcı tarih seçimini ezme
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id, heroKey]);
  useEffect(() => {
    if (index >= choices.length) setIndex(0);
  }, [choices.length, index]);
  const [bookOpen, setBookOpen] = useState(false);
  const [hotels, setHotels] = useState<ExtraCard[]>([]);
  const [cars, setCars] = useState<ExtraCard[]>([]);
  const [acts, setActs] = useState<ExtraCard[]>([]);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [dreamSaved, setDreamSaved] = useState(false);
  const [dreamBusy, setDreamBusy] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertPrice, setAlertPrice] = useState(String(Math.round(deal.price)));
  const [alertMsg, setAlertMsg] = useState("");
  const [alertBusy, setAlertBusy] = useState(false);
  const choice = choices[index] ?? choices[0];
  const iata = destCode(deal);
  const city = cityName(deal);
  const photos = cardPhotoUrls(iata, deal.cardImage);
  // Site DealDetail: arama = uçulan havalimanı, subId = şehir kodu (id’den)
  const flyTo = iataFromLabel(
    choice?.destAirport || deal.destAirport || iata,
  );
  const cityFromId = deal.id.split(":")[1] || iata;
  const citySub = iataFromLabel(cityFromId);
  const partners =
    choice
      ? partnerLinks(
          originCode(deal),
          flyTo,
          choice.outboundDate,
          choice.returnDate,
          citySub,
        )
      : [];
  const heroOld = isOldShowcaseDeal({
    foundAt: choice?.foundAt ?? deal.foundAt,
  });
  const shown = choice ? screenPrice(choice.price) : screenPrice(deal.price);
  const off = discountPercent({
    price: choice?.price ?? deal.price,
    averagePrice: deal.averagePrice,
  });
  // En dip = bu kart ailesindeki en ucuz geçerli tarih (site cityLows yoksa)
  const familyLow = familyLowPrice(deal);
  const cityLowRaw = cityLowDeal(allDeals, iata)?.price ?? null;
  const enDipRaw =
    familyLow != null && cityLowRaw != null
      ? Math.min(familyLow, cityLowRaw)
      : (familyLow ?? cityLowRaw);
  const threshold =
    typeof deal.thresholdPrice === "number" ? deal.thresholdPrice : null;
  const airline = resolveAirline(deal, choice?.airline);

  useEffect(() => {
    if (!supabase) return;
    loadProfilePrefs(supabase, session.user.id).then((p) => {
      setDreamSaved(p.destinationCodes.includes(iata));
    });
  }, [session.user.id, iata]);

  useEffect(() => {
    if (!choice || !iata) return;
    let cancelled = false;
    setExtrasLoading(true);
    Promise.all([
      fetchHotels(iata, city, choice.outboundDate, choice.returnDate),
      fetchCars(iata, city, choice.outboundDate, choice.returnDate),
      fetchActivities(iata, city, deal.destination),
    ])
      .then(([h, c, a]) => {
        if (cancelled) return;
        const fallbacks = cardPhotoUrls(iata, deal.cardImage);
        const fill = (cards: ExtraCard[]) =>
          cards.map((card, idx) => ({
            ...card,
            image:
              card.image ||
              fallbacks[idx % Math.max(fallbacks.length, 1)] ||
              fallbacks[0],
          }));
        setHotels(fill(h.cards));
        setCars(fill(c.cards));
        setActs(fill(a.cards));
      })
      .catch(() => {
        if (cancelled) return;
        setHotels([]);
        setCars([]);
        setActs([]);
      })
      .finally(() => {
        if (!cancelled) setExtrasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [choice?.outboundDate, choice?.returnDate, iata, city, deal.destination, deal.cardImage]);

  async function onDream() {
    if (!supabase || dreamBusy) return;
    setDreamBusy(true);
    try {
      const next = await toggleDreamDest(
        supabase,
        session.user.id,
        session.user.email ?? "",
        iata,
      );
      setDreamSaved(next.includes(iata));
    } catch {
      /* ignore */
    } finally {
      setDreamBusy(false);
    }
  }

  async function onShare() {
    const msg = `${city} ${money(shown, deal.currency)} — Dip Bilet\nhttps://dipbilet.com`;
    try {
      await Share.share({ message: msg });
    } catch {
      /* ignore */
    }
  }

  async function onAlertSave() {
    if (!supabase) return;
    setAlertBusy(true);
    setAlertMsg("");
    try {
      await createPriceAlert(
        supabase,
        session.user.id,
        iata,
        Number(alertPrice),
      );
      setAlertMsg("Alarm kuruldu.");
      setTimeout(() => setAlertOpen(false), 800);
    } catch (e) {
      setAlertMsg(e instanceof Error ? e.message : "Alarm kurulamadı.");
    } finally {
      setAlertBusy(false);
    }
  }

  return (
    <View style={styles.flex}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>← Vitrin</Text>
      </Pressable>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.detailScroll}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <PhotoGallery urls={photos} />
          {heroOld ? (
            <View style={styles.cardStampWrap} pointerEvents="none">
              <Text style={styles.cardStamp}>eski fırsat</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.detail}>
          <Text style={styles.city}>{city}</Text>
          {heroOld ? <Text style={styles.oldLabel}>Eski fırsat</Text> : null}
          <Text style={styles.price}>{money(shown, deal.currency)}</Text>
          {typeof deal.averagePrice === "number" ? (
            <Text style={styles.was}>{money(deal.averagePrice, deal.currency)}</Text>
          ) : null}
          {off != null ? (
            <Text style={styles.offBig}>%{off} tasarruf</Text>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionChip, dreamSaved && styles.actionChipOn]}
              onPress={onDream}
              disabled={dreamBusy}
            >
              <Text
                style={[
                  styles.actionChipText,
                  dreamSaved && styles.actionChipTextOn,
                ]}
              >
                {dreamSaved
                  ? "Hayal destinasyondan çıkar"
                  : "Hayal destinasyona ekle"}
              </Text>
            </Pressable>
            <Pressable style={styles.actionChip} onPress={onShare}>
              <Text style={styles.actionChipText}>Paylaş</Text>
            </Pressable>
            <Pressable
              style={styles.actionChip}
              onPress={() => {
                setAlertPrice(String(Math.round(choice?.price ?? deal.price)));
                setAlertMsg("");
                setAlertOpen(true);
              }}
            >
              <Text style={styles.actionChipText}>Fiyat alarmı</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Fiyat özeti</Text>
          <View style={styles.panel}>
            <PanelRow label="Bu fırsat" value={money(shown, deal.currency)} />
            <PanelRow
              label="Standart"
              value={
                typeof deal.averagePrice === "number"
                  ? money(deal.averagePrice, deal.currency)
                  : "—"
              }
            />
            <PanelRow
              label="En dip"
              value={
                enDipRaw != null
                  ? money(screenPrice(enDipRaw), deal.currency)
                  : "—"
              }
            />
            <PanelRow
              label="Fiyat eşiği"
              value={
                threshold != null ? money(threshold, deal.currency) : "—"
              }
            />
          </View>

          <Text style={styles.sectionLabel}>Uçuş</Text>
          <View style={styles.panel}>
            <PanelRow label="Havayolu" value={airline || "—"} />
            <PanelRow label="Aktarma" value={stopsLabel(deal.stops) || "—"} />
            <PanelRow
              label="Rota"
              value={`${originCode(deal)} → ${iata}`}
            />
            {deal.selfTransfer ? (
              <PanelRow label="Not" value="Ayrı bilet" />
            ) : null}
          </View>

          {choice ? (
            <View style={[styles.dateRow, styles.dateOn]}>
              <View style={styles.dateTextCol}>
                <Text style={styles.trip}>
                  {dateLabel(choice.outboundDate)} –{" "}
                  {dateLabel(choice.returnDate)}
                </Text>
                {isOldDateOption(choice.foundAt) ? (
                  <Text style={styles.oldStamp}>eski fırsat</Text>
                ) : null}
              </View>
              <Text style={styles.price}>
                {money(screenPrice(choice.price), deal.currency)}
              </Text>
            </View>
          ) : null}
          <Pressable
            style={styles.detailBook}
            onPress={() => setBookOpen(true)}
            disabled={!choice}
          >
            <Text style={styles.detailBookText}>Bileti incele</Text>
          </Pressable>

          {choices.length > 1 ? (
            <>
              <Text style={styles.sectionLabel}>Diğer tarihler</Text>
              {choices.map((c, i) => {
                if (i === index) return null;
                const old = isOldDateOption(c.foundAt);
                const cheap = isCheaperFreshDateOption(
                  c.price,
                  deal.price,
                  c.foundAt,
                );
                return (
                  <Pressable
                    key={`${i}-${c.outboundDate}-${c.returnDate}`}
                    style={styles.dateRow}
                    onPress={() => setIndex(i)}
                  >
                    <View style={styles.dateTextCol}>
                      <Text style={styles.trip}>
                        {dateLabel(c.outboundDate)} – {dateLabel(c.returnDate)}
                      </Text>
                      {old ? (
                        <Text style={styles.oldStamp}>eski fırsat</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.price, cheap && styles.dateCheap]}>
                      {money(screenPrice(c.price), deal.currency)}
                    </Text>
                  </Pressable>
                );
              })}
            </>
          ) : null}
        </View>

        <ExtrasStrip title="Oteller" cards={hotels} loading={extrasLoading} />
        <ExtrasStrip title="Araç kiralama" cards={cars} loading={extrasLoading} />
        <ExtrasStrip title="Yapılacaklar" cards={acts} loading={extrasLoading} />
        <SiteFooter />
      </ScrollView>

      <Modal
        visible={bookOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBookOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setBookOpen(false)}>
          <Pressable style={styles.bookModal} onPress={(e) => e.stopPropagation()}>
            <Pressable style={styles.modalClose} onPress={() => setBookOpen(false)}>
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Alternatif seçenekleriniz var.</Text>
            <Text style={styles.modalSub}>
              En iyi fiyatlı seçeneği aşağıdaki platformlarda arayabilirsiniz. Kiwi.com,
              Aviasales ve Trip.com linklerinden uçuşları karşılaştırabilirsiniz.
            </Text>
            {choice ? (
              <Text style={styles.modalDates}>
                Tarihler: {dateLabel(choice.outboundDate)} – {dateLabel(choice.returnDate)}
              </Text>
            ) : null}
            <View style={styles.partnerList}>
              {partners.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.partnerRow}
                  onPress={() => {
                    setBookOpen(false);
                    Linking.openURL(p.url);
                  }}
                >
                  <Image source={p.logo} style={styles.partnerLogo} />
                  <View style={styles.partnerText}>
                    <Text style={styles.partnerName}>
                      {p.name}
                      {p.id === "aviasales" ? " ★" : ""}
                    </Text>
                    {p.note ? <Text style={styles.partnerNote}>{p.note}</Text> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={alertOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAlertOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setAlertOpen(false)}>
          <Pressable style={styles.bookModal} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Fiyat alarmı</Text>
            <Text style={styles.modalSub}>
              {city} için bu fiyatın altına düşünce haber verelim.
            </Text>
            <TextInput
              style={styles.inputDark}
              keyboardType="number-pad"
              value={alertPrice}
              onChangeText={setAlertPrice}
              placeholder="Maks. fiyat (USD)"
              placeholderTextColor="#9aa6bd"
            />
            {alertMsg ? <Text style={styles.meta}>{alertMsg}</Text> : null}
            <Pressable
              style={[styles.detailBook, alertBusy && styles.buttonOff]}
              disabled={alertBusy}
              onPress={onAlertSave}
            >
              <Text style={styles.detailBookText}>
                {alertBusy ? "Kaydediliyor…" : "Alarm kur"}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function PanelRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.panelRow}>
      <Text style={styles.panelLabel}>{label}</Text>
      <Text style={styles.panelValue}>{value}</Text>
    </View>
  );
}

function AccountFlow({
  screen,
  session,
  onScreen,
  onLogout,
}: {
  screen: AppScreen;
  session: Session;
  onScreen: (s: AppScreen) => void;
  onLogout: () => void;
}) {
  if (screen === "account-dest") {
    return (
      <DestSettingsScreen
        session={session}
        onBack={() => onScreen("account")}
      />
    );
  }
  if (screen === "account-flight") {
    return (
      <FlightSettingsScreen
        session={session}
        onBack={() => onScreen("account")}
      />
    );
  }
  if (screen === "account-settings") {
    return (
      <AccountSettingsScreen
        session={session}
        onBack={() => onScreen("account")}
        onLogout={onLogout}
      />
    );
  }
  return (
    <AccountHome
      onBack={() => onScreen("vitrin")}
      onNav={onScreen}
      onLogout={onLogout}
    />
  );
}

function AccountHome({
  onBack,
  onNav,
  onLogout,
}: {
  onBack: () => void;
  onNav: (s: AppScreen) => void;
  onLogout: () => void;
}) {
  const rows: { label: string; action: () => void; danger?: boolean }[] = [
    { label: "Uçuş vitrini", action: onBack },
    { label: "Hedef destinasyonlar", action: () => onNav("account-dest") },
    { label: "Uçuş ayarları", action: () => onNav("account-flight") },
    { label: "Hesap ayarları", action: () => onNav("account-settings") },
    {
      label: "Destek ve talep",
      action: () => Linking.openURL("https://dipbilet.com/destek"),
    },
    { label: "Çıkış yap", action: onLogout, danger: true },
  ];
  return (
    <View style={styles.flex}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>← Vitrin</Text>
      </Pressable>
      <Text style={styles.accountTitle}>Hesap</Text>
      <View style={styles.accountList}>
        {rows.map((r) => (
          <Pressable key={r.label} style={styles.accountRow} onPress={r.action}>
            <Text
              style={[styles.accountRowText, r.danger && styles.accountDanger]}
            >
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <SiteFooter />
    </View>
  );
}

function DestSettingsScreen({
  session,
  onBack,
}: {
  session: Session;
  onBack: () => void;
}) {
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!supabase) return;
    loadProfilePrefs(supabase, session.user.id).then((p) =>
      setCodes(p.destinationCodes),
    );
  }, [session.user.id]);

  async function toggle(code: string) {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const next = await toggleDreamDest(
        supabase,
        session.user.id,
        session.user.email ?? "",
        code,
      );
      setCodes(next);
      setHint("Kaydedildi.");
    } catch {
      setHint("Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    if (!q) return DREAM_DEST_CATALOG;
    return DREAM_DEST_CATALOG.filter(
      (d) =>
        d.code.toLowerCase().includes(q) ||
        d.name.toLocaleLowerCase("tr-TR").includes(q),
    );
  }, [query]);

  return (
    <View style={styles.flex}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>← Hesap</Text>
      </Pressable>
      <Text style={styles.accountTitle}>Hedef destinasyonlar</Text>
      <Text style={styles.accountSub}>
        Ekle veya kaldır — kart detayından da ekleyebilirsin.
      </Text>
      {hint ? (
        <Text style={[styles.meta, { paddingHorizontal: 16 }]}>{hint}</Text>
      ) : null}
      <TextInput
        style={[styles.inputDark, { marginHorizontal: 16, marginBottom: 8 }]}
        placeholder="Şehir ara…"
        placeholderTextColor="#9aa6bd"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.code}
        contentContainerStyle={styles.list}
        ListFooterComponent={<SiteFooter />}
        renderItem={({ item }) => {
          const on = codes.includes(item.code);
          return (
            <Pressable
              style={styles.accountRow}
              onPress={() => toggle(item.code)}
              disabled={busy}
            >
              <Text style={styles.accountRowText}>
                {item.name} ({item.code})
              </Text>
              <Text style={on ? styles.check : styles.meta}>
                {on ? "✓ Eklendi" : "Ekle"}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function FlightSettingsScreen({
  session,
  onBack,
}: {
  session: Session;
  onBack: () => void;
}) {
  const [emailOn, setEmailOn] = useState(true);
  const [pushOn, setPushOn] = useState(false);
  const [msg, setMsg] = useState("");
  const [alerts, setAlerts] = useState<PriceAlertRow[]>([]);
  const [busy, setBusy] = useState(false);
  const pendingPush = useRef(false);

  const reloadAlerts = useCallback(async () => {
    if (!supabase) return;
    try {
      setAlerts(await listPriceAlerts(supabase, session.user.id));
    } catch {
      setAlerts([]);
    }
  }, [session.user.id]);

  useEffect(() => {
    if (!supabase) return;
    loadProfilePrefs(supabase, session.user.id).then((p) =>
      setEmailOn(p.emailAlerts),
    );
    isPushAlertsEnabled().then(setPushOn);
    void reloadAlerts();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void (async () => {
        if (pendingPush.current) {
          const status = await getNotificationPermission();
          if (status === "granted") {
            await setPushPref(true);
            if (supabase) {
              await syncPushTokenToProfile(
                supabase,
                session.user.id,
                session.user.email ?? "",
                true,
              );
            }
            setPushOn(true);
            setMsg("Alarm bildirimi açıldı.");
          }
          pendingPush.current = false;
          return;
        }
        setPushOn(await isPushAlertsEnabled());
      })();
    });
    return () => sub.remove();
  }, [session.user.id, reloadAlerts]);

  async function toggleEmail() {
    if (!supabase) return;
    const next = !emailOn;
    setEmailOn(next);
    try {
      await setEmailAlerts(
        supabase,
        session.user.id,
        session.user.email ?? "",
        next,
      );
      setMsg("Kaydedildi.");
    } catch {
      setEmailOn(!next);
      setMsg("Kaydedilemedi.");
    }
  }

  async function togglePush() {
    setBusy(true);
    setMsg("");
    try {
      if (pushOn) {
        await disablePushAlerts(
          supabase,
          session.user.id,
          session.user.email ?? "",
        );
        setPushOn(false);
        setMsg("Alarm bildirimi kapatıldı.");
      } else {
        const res = await enablePushAlerts(
          supabase,
          session.user.id,
          session.user.email ?? "",
        );
        if (res.ok) {
          setPushOn(true);
          setMsg(
            res.tokenSynced
              ? "Alarm bildirimi açıldı."
              : "İzin alındı. Mağaza / development build sonrası bildirimler çalışır (Expo Go’da push yok).",
          );
        } else if (res.openedSettings) {
          pendingPush.current = true;
          setMsg(
            "Bildirim izni gerekli. Ayarlardan açıp uygulamaya dön — otomatik tamamlanır.",
          );
        } else {
          setMsg("Bildirim izni verilmedi.");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeAlert(id: number) {
    if (!supabase) return;
    try {
      await deletePriceAlert(supabase, id);
      await reloadAlerts();
    } catch {
      setMsg("Alarm silinemedi.");
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 24 }}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>← Hesap</Text>
      </Pressable>
      <Text style={styles.accountTitle}>Uçuş ayarları</Text>

      <Pressable style={styles.accountRow} onPress={toggleEmail} disabled={busy}>
        <Text style={styles.accountRowText}>E-posta alarmları</Text>
        <Text style={styles.check}>{emailOn ? "Açık" : "Kapalı"}</Text>
      </Pressable>

      <Pressable style={styles.accountRow} onPress={togglePush} disabled={busy}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.accountRowText}>Alarm bildirimi</Text>
          <Text style={styles.accountHint}>
            İlgilendiğin bölgede fırsat bulununca telefonuna uygulamadan bildirim
            gelsin
          </Text>
        </View>
        <Text style={styles.check}>{pushOn ? "Açık" : "Kapalı"}</Text>
      </Pressable>

      <Text style={[styles.sectionLabel, { paddingHorizontal: 16 }]}>
        Fiyat alarmları
      </Text>
      {alerts.length === 0 ? (
        <Text style={[styles.meta, { paddingHorizontal: 16 }]}>
          Henüz fiyat alarmın yok. Kart detayından kurabilirsin.
        </Text>
      ) : (
        alerts.map((a) => (
          <Pressable
            key={a.id}
            style={styles.accountRow}
            onPress={() => removeAlert(a.id)}
          >
            <Text style={styles.accountRowText}>
              {destLabel(a.dest_code)} ≤ ${a.max_price}
            </Text>
            <Text style={styles.meta}>Sil</Text>
          </Pressable>
        ))
      )}

      {msg ? (
        <Text style={[styles.meta, { paddingHorizontal: 16, marginTop: 8 }]}>
          {msg}
        </Text>
      ) : null}
      <SiteFooter />
    </ScrollView>
  );
}

function AccountSettingsScreen({
  session,
  onBack,
  onLogout,
}: {
  session: Session;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [email, setEmail] = useState(session.user.email ?? "");
  const [newEmail, setNewEmail] = useState(session.user.email ?? "");
  const [editEmail, setEditEmail] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [editPhone, setEditPhone] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [editPassword, setEditPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    loadProfilePrefs(supabase, session.user.id).then((p) => {
      setPhone(p.phone);
      setPhoneVerified(p.phoneVerified);
      setPhoneDraft(p.phone);
    });
  }, [session.user.id]);

  async function saveEmail() {
    if (!supabase) return;
    setBusy(true);
    setErr("");
    setMsg("");
    const next = newEmail.trim();
    if (!next || next === email) {
      setErr("Yeni bir e-posta gir.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ email: next });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    await supabase.from("profiles").upsert(
      {
        id: session.user.id,
        email: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    setEmail(next);
    setEditEmail(false);
    setMsg("Doğrulama maili gönderildi. Yeni adresi onaylaman gerekebilir.");
    setBusy(false);
  }

  async function savePassword() {
    if (!supabase) return;
    setBusy(true);
    setErr("");
    setMsg("");
    if (password !== password2) {
      setErr("Şifreler eşleşmiyor.");
      setBusy(false);
      return;
    }
    if (password.trim().length < 10) {
      setErr("Şifre en az 10 karakter olmalı.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    setPassword("");
    setPassword2("");
    setEditPassword(false);
    setMsg("Şifren güncellendi.");
    setBusy(false);
  }

  async function savePhone() {
    if (!supabase) return;
    setBusy(true);
    setErr("");
    setMsg("");
    const digits = phoneDraft.replace(/\D/g, "");
    let e164 = "";
    if (digits.startsWith("90") && digits.length === 12) e164 = `+${digits}`;
    else if (digits.startsWith("0") && digits.length === 11)
      e164 = `+90${digits.slice(1)}`;
    else if (digits.length === 10) e164 = `+90${digits}`;
    else if (phoneDraft.trim().startsWith("+") && digits.length >= 10)
      e164 = `+${digits}`;
    if (!e164) {
      setErr("Geçerli bir Türkiye cep numarası gir.");
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("profiles").upsert(
      {
        id: session.user.id,
        email: session.user.email ?? "",
        phone: e164,
        phone_verified: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    setPhone(e164);
    setPhoneVerified(false);
    setEditPhone(false);
    setMsg("Telefon kaydedildi. SMS doğrulaması için siteyi kullanabilirsin.");
    setBusy(false);
  }

  async function clearPhone() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        phone: null,
        phone_verified: false,
        sms_alerts: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setPhone("");
    setPhoneVerified(false);
    setPhoneDraft("");
    setMsg("Telefon kaldırıldı.");
  }

  async function deleteAccount() {
    if (!supabase) return;
    setBusy(true);
    setErr("");
    const { error } = await supabase.rpc("delete_own_account");
    setBusy(false);
    if (error) {
      setErr(error.message || "Hesap silinemedi.");
      return;
    }
    onLogout();
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={{ paddingBottom: 32 }}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>← Hesap</Text>
      </Pressable>
      <Text style={styles.accountTitle}>Hesap ayarları</Text>
      {err ? (
        <Text style={[styles.error, { paddingHorizontal: 16 }]}>{err}</Text>
      ) : null}
      {msg ? (
        <Text style={[styles.meta, { paddingHorizontal: 16 }]}>{msg}</Text>
      ) : null}

      <Text style={[styles.sectionLabel, { paddingHorizontal: 16 }]}>
        Kişisel bilgiler
      </Text>
      <View style={[styles.panel, { marginHorizontal: 16 }]}>
        <View style={styles.settingsBlock}>
          <Text style={styles.panelLabel}>E-posta</Text>
          {editEmail ? (
            <>
              <TextInput
                style={styles.inputDark}
                autoCapitalize="none"
                keyboardType="email-address"
                value={newEmail}
                onChangeText={setNewEmail}
              />
              <View style={styles.settingsActions}>
                <Pressable onPress={saveEmail} disabled={busy}>
                  <Text style={styles.link}>Kaydet</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setEditEmail(false);
                    setNewEmail(email);
                  }}
                >
                  <Text style={styles.meta}>İptal</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.settingsActions}>
              <Text style={styles.panelValue}>{email || "—"}</Text>
              <Pressable onPress={() => setEditEmail(true)}>
                <Text style={styles.link}>Düzenle</Text>
              </Pressable>
            </View>
          )}
        </View>
        <View style={styles.settingsBlock}>
          <Text style={styles.panelLabel}>Telefon</Text>
          {editPhone ? (
            <>
              <TextInput
                style={styles.inputDark}
                keyboardType="phone-pad"
                placeholder="05xx xxx xx xx"
                placeholderTextColor="#9aa6bd"
                value={phoneDraft}
                onChangeText={setPhoneDraft}
              />
              <View style={styles.settingsActions}>
                <Pressable onPress={savePhone} disabled={busy}>
                  <Text style={styles.link}>Kaydet</Text>
                </Pressable>
                <Pressable onPress={() => setEditPhone(false)}>
                  <Text style={styles.meta}>İptal</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.settingsActions}>
              <Text style={styles.panelValue}>
                {phone
                  ? `${phone}${phoneVerified ? " · doğrulandı" : ""}`
                  : "Eklenmedi"}
              </Text>
              <Pressable onPress={() => setEditPhone(true)}>
                <Text style={styles.link}>{phone ? "Düzenle" : "Ekle"}</Text>
              </Pressable>
              {phone ? (
                <Pressable onPress={clearPhone} disabled={busy}>
                  <Text style={styles.accountDanger}>Kaldır</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      </View>

      <Text style={[styles.sectionLabel, { paddingHorizontal: 16 }]}>
        Güvenlik
      </Text>
      <View style={[styles.panel, { marginHorizontal: 16 }]}>
        <View style={styles.settingsBlock}>
          <Text style={styles.panelLabel}>Şifre</Text>
          {editPassword ? (
            <>
              <TextInput
                style={styles.inputDark}
                secureTextEntry
                placeholder="Yeni şifre (en az 10)"
                placeholderTextColor="#9aa6bd"
                value={password}
                onChangeText={setPassword}
              />
              <TextInput
                style={styles.inputDark}
                secureTextEntry
                placeholder="Şifre tekrar"
                placeholderTextColor="#9aa6bd"
                value={password2}
                onChangeText={setPassword2}
              />
              <View style={styles.settingsActions}>
                <Pressable onPress={savePassword} disabled={busy}>
                  <Text style={styles.link}>Güncelle</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setEditPassword(false);
                    setPassword("");
                    setPassword2("");
                  }}
                >
                  <Text style={styles.meta}>İptal</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.settingsActions}>
              <Text style={styles.panelValue}>••••••</Text>
              <Pressable onPress={() => setEditPassword(true)}>
                <Text style={styles.link}>Düzenle</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <Text style={[styles.sectionLabel, { paddingHorizontal: 16 }]}>
        Hesabı yönet
      </Text>
      {!confirmDelete ? (
        <Pressable
          style={styles.accountRow}
          onPress={() => setConfirmDelete(true)}
        >
          <Text style={[styles.accountRowText, styles.accountDanger]}>
            Hesabı sil
          </Text>
        </Pressable>
      ) : (
        <View style={[styles.panel, { marginHorizontal: 16, gap: 10, padding: 14 }]}>
          <Text style={styles.meta}>
            Hesabın ve kayıtlı alarmların silinir. Emin misin?
          </Text>
          <View style={styles.settingsActions}>
            <Pressable onPress={deleteAccount} disabled={busy}>
              <Text style={styles.accountDanger}>
                {busy ? "Siliniyor…" : "Evet, sil"}
              </Text>
            </Pressable>
            <Pressable onPress={() => setConfirmDelete(false)}>
              <Text style={styles.link}>Vazgeç</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Pressable style={styles.accountRow} onPress={onLogout}>
        <Text style={[styles.accountRowText, styles.accountDanger]}>
          Çıkış yap
        </Text>
      </Pressable>
      <LegalLinks />
      <SiteFooter />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f6f7f9" },
  loginScreen: { flex: 1, backgroundColor: NAVY },
  flex: { flex: 1 },
  flexGrow: { flexGrow: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f6f7f9",
  },
  boot: {
    flex: 1,
    backgroundColor: NAVY,
    paddingBottom: 72,
  },
  bootCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bootLogo: { width: 120, height: 120, borderRadius: 28 },
  bootBrand: {
    color: "#fff",
    fontSize: 22,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  login: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 12,
    backgroundColor: NAVY,
  },
  loginLogo: {
    width: 96,
    height: 96,
    borderRadius: 22,
    alignSelf: "center",
    marginBottom: 4,
  },
  brand: {
    fontSize: 34,
    fontWeight: "400",
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: 0.2,
    fontFamily: "Calistoga_400Regular",
    minHeight: 44,
  },
  brandSmall: { fontSize: 20, fontWeight: "700", color: NAVY },
  topBrand: { flexDirection: "row", alignItems: "center", gap: 8 },
  topLogo: { width: 32, height: 32, borderRadius: 8 },
  accountBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e8ef",
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  legalLink: {
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  legalSep: { fontSize: 13 },
  siteFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  siteFooterText: {
    fontFamily: "Calistoga_400Regular",
    fontSize: 14,
    color: "#8a93a3",
    letterSpacing: 0.4,
  },
  filterBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterPill: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e8ef",
    justifyContent: "center",
    alignItems: "center",
  },
  filterPillOn: { backgroundColor: NAVY, borderColor: NAVY },
  filterPillText: {
    color: NAVY,
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  filterPillTextOn: { color: "#fff" },
  clearPill: {
    height: 36,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  clearPillText: {
    color: "#9b1c1c",
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  filterPanel: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e4e8ef",
    padding: 8,
    maxHeight: 220,
  },
  filterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  filterRowText: { color: "#111", fontSize: 15 },
  check: { color: NAVY, fontWeight: "700", minWidth: 28, textAlign: "right" },
  filterHint: { color: "#52607a", padding: 8 },
  priceFilter: { padding: 8, gap: 8 },
  priceInputs: { flexDirection: "row", alignItems: "center", gap: 8 },
  priceInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d7dde8",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: "#111",
    backgroundColor: "#fafbfd",
  },
  detailBook: {
    backgroundColor: NAVY,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  detailBookText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  bookModal: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 20,
    gap: 10,
  },
  modalClose: { alignSelf: "flex-end", padding: 4 },
  modalCloseText: { fontSize: 18, color: "#52607a" },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#111" },
  modalSub: { color: "#52607a", lineHeight: 20 },
  modalDates: { color: NAVY, fontWeight: "600", marginTop: 4 },
  partnerList: { gap: 10, marginTop: 8 },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e4e8ef",
    backgroundColor: "#fafbfd",
  },
  partnerLogo: { width: 36, height: 36, borderRadius: 8 },
  partnerText: { flex: 1, gap: 2 },
  partnerName: { fontSize: 16, fontWeight: "700", color: "#111" },
  partnerNote: { fontSize: 12, color: "#52607a" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dde8",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111",
  },
  inputDark: {
    backgroundColor: "#fafbfd",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d7dde8",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111",
  },
  button: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  googleButton: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  googleIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonText: { color: "#1a1a1a", fontWeight: "700", fontSize: 16 },
  buttonOff: { opacity: 0.6 },
  buttonText: { color: NAVY, fontWeight: "700", fontSize: 16 },
  error: { color: "#9b1c1c" },
  errorOnNavy: { color: "#ffb4b4", textAlign: "center" },
  infoOnNavy: { color: "#b8e0c2", textAlign: "center", lineHeight: 20 },
  forgotHint: {
    color: "#c5d0e4",
    textAlign: "center",
    marginBottom: 4,
    lineHeight: 20,
  },
  forgotWrap: { alignSelf: "flex-end", paddingVertical: 4, paddingHorizontal: 2 },
  forgotLink: { color: "#9ec5ff", fontSize: 14, fontWeight: "600" },
  errorLight: { color: "#ffd0d0" },
  muted: {
    color: "#52607a",
    textAlign: "center",
    marginTop: 48,
    paddingHorizontal: 24,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  link: { color: NAVY, fontWeight: "600" },
  list: { padding: 16, gap: 12, paddingBottom: 8 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 12,
  },
  photo: { width: "100%", height: 140, backgroundColor: "#d7dde8" },
  photoEmpty: { height: 72 },
  cardStampWrap: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    alignItems: "flex-start",
  },
  cardStamp: {
    fontSize: 11,
    fontWeight: "800",
    color: "#5c3d00",
    backgroundColor: "#ffd978",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  oldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8a5a00",
  },
  cardBody: { padding: 14, gap: 4 },
  city: { fontSize: 20, fontWeight: "700", color: "#111" },
  trip: { color: "#52607a" },
  priceLine: { marginTop: 4 },
  price: { fontSize: 18, fontWeight: "700", color: NAVY },
  was: { color: "#8a93a3", textDecorationLine: "line-through", fontSize: 14 },
  off: { color: "#1a7a3c", fontWeight: "700", fontSize: 14 },
  offBig: { color: "#1a7a3c", fontWeight: "700", fontSize: 15 },
  meta: { color: "#52607a", marginTop: 2 },
  back: { paddingHorizontal: 16, paddingVertical: 10 },
  hero: { height: 200, backgroundColor: "#d7dde8" },
  dots: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  dotOn: { backgroundColor: "#fff" },
  lightbox: {
    flex: 1,
    backgroundColor: "#000",
  },
  lightboxClose: {
    position: "absolute",
    top: 48,
    right: 20,
    zIndex: 2,
    padding: 8,
  },
  lightboxCloseText: { color: "#fff", fontSize: 22 },
  detailScroll: { paddingBottom: 24 },
  detail: { padding: 16, gap: 8 },
  sectionLabel: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
  },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e4e8ef",
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  panelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e4e8ef",
  },
  panelLabel: { color: "#52607a", fontSize: 14 },
  panelValue: { color: "#111", fontWeight: "600", fontSize: 14 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  actionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e8ef",
  },
  actionChipOn: { backgroundColor: NAVY, borderColor: NAVY },
  actionChipText: { color: NAVY, fontWeight: "600", fontSize: 13 },
  actionChipTextOn: { color: "#fff" },
  dateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e8ef",
  },
  dateOn: { borderColor: NAVY },
  dateTextCol: { flex: 1, gap: 2, paddingRight: 8 },
  dateCheap: {
    color: "#15803d",
    backgroundColor: "#ecfdf3",
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  oldStamp: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    color: "#8a5a00",
    backgroundColor: "#ffe8b8",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  extraBlock: { marginTop: 8, paddingBottom: 8 },
  extraTitle: {
    paddingHorizontal: 16,
    fontSize: 17,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  extraList: { paddingHorizontal: 16, gap: 10 },
  extraCard: {
    width: 150,
    backgroundColor: "#fff",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e4e8ef",
  },
  extraPhoto: { width: "100%", height: 90, backgroundColor: "#d7dde8" },
  extraName: {
    paddingHorizontal: 10,
    paddingTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#111",
    minHeight: 36,
  },
  extraPrice: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: NAVY,
  },
  accountTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  accountSub: {
    color: "#52607a",
    paddingHorizontal: 16,
    marginBottom: 12,
    lineHeight: 20,
  },
  accountList: { paddingHorizontal: 16, gap: 8 },
  accountRow: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e4e8ef",
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  accountRowText: { fontSize: 16, fontWeight: "600", color: "#111" },
  accountDanger: { color: "#9b1c1c", fontWeight: "600" },
  accountHint: {
    color: "#52607a",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  settingsBlock: {
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e4e8ef",
  },
  settingsActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
  },
});
