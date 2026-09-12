"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

function destCodesFrom(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is string => typeof c === "string" && c.trim() !== "")
    .map((c) => c.trim().toUpperCase());
}

export function DreamDestToggle({ destCode }: { destCode: string }) {
  const code = destCode.trim().toUpperCase();
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    if (!supabase || !code) {
      setReady(true);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoggedIn(false);
      setSaved(false);
      setReady(true);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("destination_codes")
      .eq("id", user.id)
      .maybeSingle();
    const codes = destCodesFrom(data?.destination_codes);
    setLoggedIn(true);
    setSaved(codes.includes(code));
    setReady(true);
  }, [code]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggle() {
    if (!code || busy) return;
    const supabase = createClient();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setBusy(true);
    const { data } = await supabase
      .from("profiles")
      .select("destination_codes")
      .eq("id", user.id)
      .maybeSingle();
    const current = destCodesFrom(data?.destination_codes);
    const next = current.includes(code)
      ? current.filter((item) => item !== code)
      : [...current, code];
    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? "",
        destination_codes: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (!error) setSaved(next.includes(code));
    setBusy(false);
  }

  if (!code) return null;

  if (!ready) {
    return (
      <span className="dream-dest-btn dream-dest-btn--ghost" aria-hidden="true">
        <HeartIcon filled={false} />
        <span>Hayal destinasyon</span>
      </span>
    );
  }

  if (!loggedIn) {
    return (
      <Link href="/giris" className="dream-dest-btn">
        <HeartIcon filled={false} />
        <span>Hayal destinasyona ekle</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={saved ? "dream-dest-btn dream-dest-btn--on" : "dream-dest-btn"}
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={saved}
    >
      <HeartIcon filled={saved} />
      <span>
        {saved ? "Hayal destinasyondan çıkar" : "Hayal destinasyona ekle"}
      </span>
    </button>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        d="M12 21s-6.7-4.35-9.33-8.4C.8 9.7 1.7 6 4.8 5.1c1.8-.5 3.6.3 4.6 1.8 1-1.5 2.8-2.3 4.6-1.8 3.1.9 4 4.6 2.13 7.5C18.7 16.65 12 21 12 21z"
      />
    </svg>
  );
}
