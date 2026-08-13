"use client";

import { useEffect, useState } from "react";
import { PhoneVerify } from "@/components/account/PhoneVerify";
import { createClient } from "@/lib/supabase/client";

export function AccountDetails() {
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      setNewEmail(user.email ?? "");

      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, phone_verified")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.phone) setPhone(profile.phone);
      setPhoneVerified(Boolean(profile?.phone_verified || user.phone));
    })();
  }, []);

  async function saveEmail() {
    setError(null);
    setMsg(null);
    const next = newEmail.trim();
    if (!next || next === email) {
      setError("Yeni bir e-posta gir.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setError("Bağlantı kurulamadı.");
      setLoading(false);
      return;
    }
    const { error: err } = await supabase.auth.updateUser({ email: next });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    }
    setMsg("Doğrulama maili gönderildi. Yeni adresi onaylaman gerekebilir.");
    setLoading(false);
  }

  async function savePassword() {
    setError(null);
    setMsg(null);
    if (password.length < 6) {
      setError("Şifre en az 6 karakter olmalı.");
      return;
    }
    if (password !== password2) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setError("Bağlantı kurulamadı.");
      setLoading(false);
      return;
    }
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setPassword("");
    setPassword2("");
    setMsg("Şifren güncellendi.");
    setLoading(false);
  }

  return (
    <div className="account-section">
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
      {msg ? <p className="auth-alert auth-alert--ok">{msg}</p> : null}

      <label className="account-field">
        <span>E-posta</span>
        <div className="account-field__row">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            autoComplete="email"
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={saveEmail}
            disabled={loading}
          >
            Kaydet
          </button>
        </div>
      </label>

      <label className="account-field">
        <span>Yeni şifre</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="En az 6 karakter"
        />
      </label>
      <label className="account-field">
        <span>Şifre tekrar</span>
        <div className="account-field__row">
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={savePassword}
            disabled={loading}
          >
            Güncelle
          </button>
        </div>
      </label>

      <PhoneVerify
        phone={phone}
        onPhoneChange={(v) => {
          setPhone(v);
          setPhoneVerified(false);
        }}
        verified={phoneVerified}
        onVerified={(next) => {
          setPhone(next);
          setPhoneVerified(true);
          setMsg("Telefon numaran doğrulandı.");
        }}
        disabled={loading}
      />
    </div>
  );
}
