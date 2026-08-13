"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DESTINATION_OPTIONS } from "@/lib/destinations";
import { departureDisplay } from "@/lib/departures";
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

export function FlightSettings() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [email, setEmail] = useState("");
  const [departureCode, setDepartureCode] = useState("IST");
  const [destCodes, setDestCodes] = useState<string[]>([]);
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
      setEmail(user.email ?? "");
      const { data } = await supabase
        .from("profiles")
        .select(
          "email_alerts, sms_alerts, phone_verified, departure_code, destination_codes",
        )
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setEmailAlerts(data.email_alerts ?? true);
        setSmsAlerts(Boolean(data.sms_alerts));
        if (data.departure_code) setDepartureCode(data.departure_code);
        setDestCodes(data.destination_codes ?? []);
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

  const destCount = destCodes.length;
  const destMax = DESTINATION_OPTIONS.length;

  return (
    <div className="settings-page">
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}

      <section className="settings-section">
        <h2>Bildirim ayarları</h2>

        <div className="settings-row">
          <div>
            <strong>E-posta bildirimleri</strong>
            <p>
              Dip fırsatları e-posta kutuna gelsin
              {email ? ` · ${email}` : ""}
            </p>
          </div>
          <Switch
            label="E-posta bildirimleri"
            checked={emailAlerts}
            disabled={loading}
            onChange={() => void patch({ email_alerts: !emailAlerts })}
          />
        </div>

        <div className="settings-row">
          <div>
            <strong>SMS bildirimleri</strong>
            <p>
              Yakında aktif olacak. Telefonunu{" "}
              <Link href="/hesap-ayarlari">hesap ayarlarından</Link> ekleyebilirsin.
            </p>
          </div>
          <Switch
            label="SMS bildirimleri"
            checked={smsAlerts}
            disabled
            onChange={() => {}}
          />
        </div>
      </section>

      <section className="settings-section">
        <h2>Havalimanı ayarları</h2>

        <div className="settings-row">
          <div>
            <strong>Kalkış havalimanı</strong>
            <p>{departureDisplay(departureCode)}</p>
          </div>
          <Link className="settings-edit" href="/firsatlarim">
            Düzenle
          </Link>
        </div>

        <div className="settings-row">
          <div>
            <strong>Hedef destinasyonlar</strong>
            <p>
              {destCount > 0
                ? `${destCount}/${destMax} destinasyon seçili`
                : "Henüz destinasyon seçilmedi"}
            </p>
          </div>
          <Link className="settings-edit" href="/hedef-destinasyonlar">
            Düzenle
          </Link>
        </div>
      </section>
    </div>
  );
}
