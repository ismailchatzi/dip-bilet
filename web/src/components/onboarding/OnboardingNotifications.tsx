"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={[
        "pref-switch",
        checked ? "pref-switch--on" : "",
        disabled ? "pref-switch--disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
    >
      <span className="pref-switch__knob" />
    </button>
  );
}

function normalizeTrPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("90") && digits.length === 12) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+90${digits.slice(1)}`;
  if (digits.length === 10) return `+90${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 10) return `+${digits}`;
  return null;
}

export function OnboardingNotifications({
  initialEmail,
}: {
  initialEmail: string;
}) {
  const router = useRouter();
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [phone, setPhone] = useState("");
  const [showPhone, setShowPhone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("email_alerts, sms_alerts, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setEmailAlerts(data.email_alerts ?? true);
        setSmsAlerts(Boolean(data.sms_alerts));
        if (data.phone) setPhone(data.phone);
      }
    })();
  }, []);

  async function savePhoneDraft() {
    setPhoneMsg(null);
    setError(null);
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Oturum bulunamadı.");
      setLoading(false);
      return;
    }

    const { error: err } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? "",
        phone: normalized,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    setPhone(normalized);
    setPhoneMsg(
      "Numaran kaydedildi. SMS bildirimleri yakında açılacak; doğrulama da o zaman devreye girecek.",
    );
    setLoading(false);
  }

  async function onFinish() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setError("Bağlantı kurulamadı.");
      setLoading(false);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Oturum bulunamadı.");
      setLoading(false);
      return;
    }

    const { error: err } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? "",
        email_alerts: emailAlerts,
        sms_alerts: false,
        onboarding_step: 3,
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    router.push("/firsatlarim");
    router.refresh();
  }

  return (
    <div className="onboarding-step">
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
      {phoneMsg ? (
        <p className="auth-alert auth-alert--ok">{phoneMsg}</p>
      ) : null}

      <div className="onboarding-notify-block">
        <div className="pref-row onboarding-pref-row">
          <div>
            <strong>E-posta bildirimleri</strong>
            <p className="onboarding-email-readout">{initialEmail}</p>
          </div>
          <Switch
            label="E-posta bildirimleri"
            checked={emailAlerts}
            disabled={loading}
            onChange={() => setEmailAlerts((v) => !v)}
          />
        </div>

        <div className="pref-row onboarding-pref-row">
          <div>
            <strong>SMS bildirimleri</strong>
            <p>
              Yakında — numaranı şimdiden ekleyebilirsin, bildirimler sonra
              açılacak.
            </p>
          </div>
          <Switch
            label="SMS bildirimleri"
            checked={smsAlerts}
            disabled
            onChange={() => {}}
          />
        </div>
      </div>

      {!showPhone ? (
        <button
          type="button"
          className="btn btn-onboarding-link"
          onClick={() => setShowPhone(true)}
        >
          Telefon numaramı ekle ve doğrula
        </button>
      ) : (
        <div className="onboarding-phone">
          <label className="account-field">
            <span>Telefon numarası</span>
            <div className="account-field__row">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xx xxx xx xx"
                autoComplete="tel"
              />
              <button
                type="button"
                className="btn btn-onboarding-secondary"
                disabled={loading}
                onClick={() => void savePhoneDraft()}
              >
                Kaydet
              </button>
            </div>
          </label>
          <p className="onboarding-hint">
            Doğrulama kodu ve SMS uyarıları bir sonraki aşamada devreye
            girecek.
          </p>
        </div>
      )}

      <div className="onboarding-actions onboarding-actions--split">
        <button
          type="button"
          className="btn btn-onboarding-ghost"
          onClick={() => router.push("/onboarding/destinasyonlar")}
        >
          Geri
        </button>
        <button
          type="button"
          className="btn btn-onboarding"
          disabled={loading}
          onClick={() => void onFinish()}
        >
          {loading ? "Tamamlanıyor…" : "Fırsat vitrinine git"}
        </button>
      </div>
    </div>
  );
}
