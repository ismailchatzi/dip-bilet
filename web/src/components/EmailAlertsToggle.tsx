"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function EmailAlertsToggle({
  initialEnabled,
}: {
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onToggle() {
    setError(null);
    setLoading(true);
    const next = !enabled;

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

    const { error: updateError } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? "",
        email_alerts: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setEnabled(next);
    setLoading(false);
  }

  return (
    <div className="account-prefs">
      <h2>Bildirimler</h2>
      <p>
        Yeni dip fırsat yakalanınca e-posta gönderilsin. İstediğin zaman
        kapatabilirsin.
      </p>
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
      <button
        type="button"
        className={enabled ? "btn btn-alert-on" : "btn btn-primary"}
        onClick={onToggle}
        disabled={loading}
        aria-pressed={enabled}
      >
        {loading ? "Kaydediliyor..." : enabled ? "Bildirimi kapat" : "Aç"}
      </button>
    </div>
  );
}
