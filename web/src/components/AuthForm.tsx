"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { postAuthPath, fetchOnboardingProfile } from "@/lib/onboarding";
import { createClient, isAuthConfigured } from "@/lib/supabase/client";

type Mode = "signup" | "login";

function authErrorMessage(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: string }).message)
      : err instanceof Error
        ? err.message
        : "";

  const lower = raw.toLowerCase();

  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid credentials")
  ) {
    return "E-posta veya şifre hatalı.";
  }

  if (lower.includes("email not confirmed")) {
    return "E-posta henüz onaylanmamış. Gelen kutundaki linke tıkla.";
  }

  if (lower.includes("user already registered")) {
    return "Bu e-posta ile zaten kayıt var. Giriş yapmayı dene.";
  }

  return raw || "Bir hata oluştu.";
}

export function AuthForm({ mode }: { mode: Mode }) {
  const searchParams = useSearchParams();
  const configured = useMemo(() => isAuthConfigured(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "login") return;
    if (searchParams.get("aktif") === "1") {
      setMessage(
        "Hesabın aktif edildi. Devam etmek için e-posta ve şifrenle giriş yap.",
      );
    }
    if (searchParams.get("hata") === "auth") {
      setError("Doğrulama tamamlanamadı. Tekrar giriş veya kayıt dene.");
    }
  }, [mode, searchParams]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!configured) {
      setError(
        "Üyelik altyapısı henüz bağlanmadı. Supabase anahtarlarını .env.local dosyasına eklemen gerekiyor.",
      );
      return;
    }

    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalı.");
      return;
    }

    if (mode === "signup" && password !== password2) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Bağlantı kurulamadı.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const { error: signError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?flow=confirm`,
          },
        });
        if (signError) throw signError;
        setMessage(
          "Kayıt alındı. E-posta kutunu kontrol et; onay linkine tıklayınca giriş ekranına döneceksin.",
        );
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) throw loginError;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const profile = user
          ? await fetchOnboardingProfile(supabase, user.id)
          : null;
        window.location.href = postAuthPath(profile);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setMessage(null);

    if (!configured) {
      setError(
        "Google girişi için önce Supabase + Google OAuth ayarları lazım.",
      );
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Bağlantı kurulamadı.");
      return;
    }

    const site =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      window.location.origin;

    setLoading(true);
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${site}/auth/callback`,
      },
    });
    if (googleError) {
      setError(googleError.message);
      setLoading(false);
    }
  }

  return (
    <div className="auth-card">
      <form className="auth-form" onSubmit={onSubmit}>
        <label className="auth-field">
          {mode === "login" ? null : <span>E-posta</span>}
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={mode === "login" ? "Email" : "ornek@mail.com"}
          />
        </label>

        <label className="auth-field">
          <span>Şifre</span>
          <input
            type="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="En az 6 karakter"
          />
        </label>

        {mode === "signup" ? (
          <label className="auth-field">
            <span>Şifre tekrar</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="Şifreyi tekrar yaz"
            />
          </label>
        ) : null}

        {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
        {message ? (
          <p className="auth-alert auth-alert--ok">{message}</p>
        ) : null}

        <button className="btn btn-signup auth-submit" type="submit" disabled={loading}>
          {loading
            ? "Bekle..."
            : mode === "signup"
              ? "Ücretsiz Üye Ol"
              : "Giriş Yap"}
        </button>
      </form>

      <div className="auth-divider">
        <span>veya</span>
      </div>

      <button
        type="button"
        className="btn btn-google"
        onClick={onGoogle}
        disabled={loading}
      >
        <GoogleIcon />
        Google ile {mode === "signup" ? "kaydol" : "giriş yap"}
      </button>

      <p className="auth-switch">
        {mode === "signup" ? (
          <>
            Zaten hesabın var mı? <Link href="/giris">Giriş yap</Link>
          </>
        ) : (
          <>
            Hesabın yok mu? <Link href="/uye-ol">Ücretsiz üye ol</Link>
          </>
        )}
      </p>

      <p className="auth-legal">
        Devam ederek{" "}
        <Link href="/kullanim-sartlari">Kullanım Şartları</Link> ve{" "}
        <Link href="/gizlilik">Gizlilik Politikası</Link>’nı kabul etmiş
        olursun.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.3 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l.1.1 6.2 5.2C39.2 37.2 44 32 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
