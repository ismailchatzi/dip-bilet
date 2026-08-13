"use client";

import { useState } from "react";
import { normalizeTrPhone } from "@/lib/phone";

export function PhoneVerify({
  phone,
  onPhoneChange,
  verified,
  onVerified,
  disabled,
}: {
  phone: string;
  onPhoneChange: (value: string) => void;
  verified: boolean;
  onVerified: (phone: string) => void;
  disabled?: boolean;
}) {
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    setMsg(null);
    const normalized = normalizeTrPhone(phone);
    if (!normalized) {
      setError("Geçerli bir telefon gir (örn. 05xx xxx xx xx).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sms/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error || "Kod gönderilemedi.");
        return;
      }
      onPhoneChange(normalized);
      setOtpSent(true);
      setMsg("Doğrulama kodu telefonuna gönderildi.");
    } catch {
      setError("Kod gönderilemedi.");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setError(null);
    setMsg(null);
    const normalized = normalizeTrPhone(phone);
    if (!normalized || otp.trim().length < 4) {
      setError("Telefon ve kodu kontrol et.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sms/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized, code: otp.trim() }),
      });
      const body = (await res.json()) as { error?: string; phone?: string };
      if (!res.ok) {
        setError(body.error || "Doğrulama başarısız.");
        return;
      }
      setOtp("");
      setOtpSent(false);
      setMsg("Telefon numaran doğrulandı.");
      onVerified(body.phone || normalized);
    } catch {
      setError("Doğrulama başarısız.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="phone-verify">
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
      {msg ? <p className="auth-alert auth-alert--ok">{msg}</p> : null}
      <label className="account-field">
        <span>
          Telefon{" "}
          {verified ? <em className="account-verified">· doğrulandı</em> : null}
        </span>
        <div className="account-field__row">
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              onPhoneChange(e.target.value);
              setOtpSent(false);
            }}
            placeholder="05xx xxx xx xx"
            autoComplete="tel"
            disabled={disabled || loading}
          />
          <button
            type="button"
            className="btn btn-onboarding-secondary"
            onClick={() => void sendCode()}
            disabled={disabled || loading}
          >
            {otpSent ? "Tekrar gönder" : "Kod gönder"}
          </button>
        </div>
      </label>
      {otpSent && !verified ? (
        <label className="account-field">
          <span>Doğrulama kodu</span>
          <div className="account-field__row">
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6 haneli kod"
              disabled={loading}
            />
            <button
              type="button"
              className="btn btn-onboarding"
              onClick={() => void verify()}
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
