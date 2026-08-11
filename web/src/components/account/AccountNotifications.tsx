"use client";

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

export function AccountNotifications() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
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
      const { data } = await supabase
        .from("profiles")
        .select("email_alerts, sms_alerts, phone_verified")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setEmailAlerts(data.email_alerts ?? true);
        setSmsAlerts(Boolean(data.sms_alerts));
        setPhoneVerified(Boolean(data.phone_verified));
      }
    })();
  }, []);

  async function patch(next: {
    email_alerts?: boolean;
    sms_alerts?: boolean;
  }) {
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
        ...next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    if (typeof next.email_alerts === "boolean") setEmailAlerts(next.email_alerts);
    if (typeof next.sms_alerts === "boolean") setSmsAlerts(next.sms_alerts);
    setLoading(false);
  }

  return (
    <div className="account-section">
      <p className="account-muted">
        Yeni dip fırsat yakalanınca nasıl haber alacağını seç.
      </p>
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}

      <div className="pref-row">
        <div>
          <strong>Mail ile bilgilendirme</strong>
          <p>E-posta adresine anlık fırsat maili</p>
        </div>
        <Switch
          label="Mail ile bilgilendirme"
          checked={emailAlerts}
          disabled={loading}
          onChange={() => void patch({ email_alerts: !emailAlerts })}
        />
      </div>

      <div className="pref-row">
        <div>
          <strong>SMS ile bilgilendirme</strong>
          <p>
            {phoneVerified
              ? "Doğrulanmış telefonuna SMS"
              : "Önce hesap bilgilerinden telefon doğrula"}
          </p>
        </div>
        <Switch
          label="SMS ile bilgilendirme"
          checked={smsAlerts}
          disabled={loading || !phoneVerified}
          onChange={() => {
            if (!phoneVerified) return;
            void patch({ sms_alerts: !smsAlerts });
          }}
        />
      </div>
    </div>
  );
}
