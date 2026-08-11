"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function normalizeTrPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+90${digits.slice(1)}`;
  if (digits.length === 10) return `+90${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

export function AccountDetails() {
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
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

  async function sendPhoneCode() {
    setError(null);
    setMsg(null);
    const normalized = normalizeTrPhone(phone);
    if (!normalized) {
      setError("Geçerli bir telefon gir (örn. 05xx xxx xx xx).");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setError("Bağlantı kurulamadı.");
      setLoading(false);
      return;
    }
    const { error: err } = await supabase.auth.updateUser({ phone: normalized });
    if (err) {
      setError(
        err.message.includes("Phone") || err.message.includes("provider")
          ? "SMS altyapısı henüz açık değil. Yakında aktif olacak."
          : err.message,
      );
      setLoading(false);
      return;
    }
    setPhone(normalized);
    setOtpSent(true);
    setMsg("Doğrulama kodu telefonuna gönderildi.");
    setLoading(false);
  }

  async function verifyPhoneCode() {
    setError(null);
    setMsg(null);
    const normalized = normalizeTrPhone(phone);
    if (!normalized || otp.trim().length < 4) {
      setError("Telefon ve kodu kontrol et.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setError("Bağlantı kurulamadı.");
      setLoading(false);
      return;
    }
    const { error: err } = await supabase.auth.verifyOtp({
      phone: normalized,
      token: otp.trim(),
      type: "phone_change",
    });
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
          email: user.email ?? "",
          phone: normalized,
          phone_verified: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    }
    setPhoneVerified(true);
    setOtpSent(false);
    setOtp("");
    setMsg("Telefon numaran doğrulandı.");
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

      <label className="account-field">
        <span>
          Telefon {phoneVerified ? <em className="account-verified">· doğrulandı</em> : null}
        </span>
        <div className="account-field__row">
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setPhoneVerified(false);
              setOtpSent(false);
            }}
            placeholder="05xx xxx xx xx"
            autoComplete="tel"
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={sendPhoneCode}
            disabled={loading}
          >
            Kod gönder
          </button>
        </div>
      </label>

      {otpSent && !phoneVerified ? (
        <label className="account-field">
          <span>Doğrulama kodu</span>
          <div className="account-field__row">
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6 haneli kod"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={verifyPhoneCode}
              disabled={loading}
            >
              Doğrula
            </button>
          </div>
        </label>
      ) : null}
    </div>
  );
}
