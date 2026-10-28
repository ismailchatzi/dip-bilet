"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { newPasswordError, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { createClient, isAuthConfigured } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isAuthConfigured()) {
      setError("Üyelik altyapısı bağlı değil.");
      return;
    }
    if (password !== password2) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    const pwdError = await newPasswordError(password);
    if (pwdError) {
      setError(pwdError);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Bağlantı kurulamadı.");
      return;
    }

    setLoading(true);
    try {
      const { error: updError } = await supabase.auth.updateUser({ password });
      if (updError) throw updError;
      setDone(true);
    } catch (err) {
      const raw =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Şifre güncellenemedi.";
      setError(
        /session|jwt|auth/i.test(raw)
          ? "Oturum geçersiz veya süresi dolmuş. Maildeki linke tekrar tıkla."
          : raw,
      );
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="auth-card">
        <p className="auth-alert auth-alert--ok">
          Şifren güncellendi. Artık yeni şifrenle giriş yapabilirsin.
        </p>
        <Link className="btn btn-signup auth-submit" href="/giris">
          Girişe dön
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <form className="auth-form" onSubmit={onSubmit}>
        <label className="auth-field">
          <span>Yeni şifre</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`En az ${MIN_PASSWORD_LENGTH} karakter`}
          />
        </label>
        <label className="auth-field">
          <span>Şifre tekrar</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder="Şifreyi tekrar yaz"
          />
        </label>
        {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
        <button className="btn btn-signup auth-submit" type="submit" disabled={loading}>
          {loading ? "Kaydediliyor…" : "Şifreyi kaydet"}
        </button>
      </form>
      <p className="auth-switch">
        <Link href="/giris">Girişe dön</Link>
      </p>
    </div>
  );
}
