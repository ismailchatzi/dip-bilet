import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const STORAGE_KEY = "dipbilet_gmail_inbox_tip_seen_v2";
const DURATION_MS = 20_000;
const NAVY = "#00153d";

export function GmailInboxTip() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(1);
  const remainingRef = useRef(DURATION_MS);
  const lastTickRef = useRef(0);
  const pausedRef = useRef(false);
  const closedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const dismiss = useCallback(async () => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (!cancelled && v !== "1") setVisible(true);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    lastTickRef.current = Date.now();

    const tick = () => {
      const now = Date.now();
      if (!pausedRef.current) {
        remainingRef.current = Math.max(
          0,
          remainingRef.current - (now - lastTickRef.current),
        );
        setProgress(remainingRef.current / DURATION_MS);
        if (remainingRef.current <= 0) {
          void dismiss();
          return;
        }
      }
      lastTickRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <Pressable
      style={styles.tip}
      onPressIn={() => {
        pausedRef.current = true;
      }}
      onPressOut={() => {
        pausedRef.current = false;
        lastTickRef.current = Date.now();
      }}
      accessibilityRole="summary"
    >
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(0, progress) * 100}%` }]} />
      </View>
      <Pressable
        style={styles.close}
        onPress={() => void dismiss()}
        hitSlop={10}
        accessibilityLabel="Kapat"
      >
        <Text style={styles.closeText}>×</Text>
      </Pressable>
      <Text style={styles.kicker}>Önemli</Text>
      <Text style={styles.lead}>
        Fırsat maillerinin telefonda bildirim vermesi için Dip Bilet’i Ana Gelen
        Kutusu’na alın.
      </Text>
      <Text style={styles.step}>
        1. Telefon: maile tıklayın →{" "}
        <Text style={styles.strong}>Taşı</Text> (sağ ok) →{" "}
        <Text style={styles.strong}>Birincil</Text>
      </Text>
      <Text style={styles.step}>
        2. Bilgisayar: gelen maili{" "}
        <Text style={styles.strong}>Birincil</Text> sekmesine sürükleyin
      </Text>
      <Text style={styles.step}>
        3. “Gelecekteki iletiler için de uygula?” →{" "}
        <Text style={styles.strong}>Evet</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tip: {
    position: "absolute",
    top: 52,
    right: 12,
    zIndex: 40,
    width: 280,
    maxWidth: "92%",
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e6e6e6",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  barTrack: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    overflow: "hidden",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: "#eef1f5",
  },
  barFill: {
    height: "100%",
    backgroundColor: NAVY,
  },
  close: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { fontSize: 20, color: "#777", lineHeight: 22 },
  kicker: {
    marginRight: 28,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: NAVY,
  },
  lead: {
    marginRight: 8,
    marginBottom: 8,
    fontSize: 14,
    lineHeight: 19,
    color: "#1a1a1a",
  },
  step: {
    fontSize: 12,
    lineHeight: 17,
    color: "#52607a",
    marginBottom: 3,
  },
  strong: { color: "#0a0a0a", fontWeight: "700" },
});
