"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PhoneVerify } from "@/components/account/PhoneVerify";
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

export function OnboardingNotifications({
  initialEmail,
}: {
  initialEmail: string;
}) {
  const router = useRouter();
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        .select("email_alerts, sms_alerts, phone, phone_verified")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setEmailAlerts(data.email_alerts ?? true);
        setSmsAlerts(Boolean(data.sms_alerts));
        if (data.phone) setPhone(data.phone);
        setPhoneVerified(Boolean(data.phone_verified));
      }
    })();
  }, []);

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
        sms_alerts: phoneVerified ? smsAlerts : false,
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
              {phoneVerified
                ? "Doğrulanmış telefonuna dip fırsat SMS’i"
                : "Önce telefonunu ekle ve doğrula"}
            </p>
          </div>
          <Switch
            label="SMS bildirimleri"
            checked={smsAlerts}
            disabled={loading || !phoneVerified}
            onChange={() => {
              if (!phoneVerified) return;
              setSmsAlerts((v) => !v);
            }}
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
          <PhoneVerify
            phone={phone}
            onPhoneChange={(v) => {
              setPhone(v);
              setPhoneVerified(false);
              setSmsAlerts(false);
            }}
            verified={phoneVerified}
            onVerified={(next) => {
              setPhone(next);
              setPhoneVerified(true);
            }}
            disabled={loading}
          />
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
