"use client";

import { useState } from "react";

export function DeleteAccountButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    const ok = window.confirm(
      "Hesabını kalıcı olarak silmek istiyor musun? Bu işlem geri alınamaz.",
    );
    if (!ok) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || "Hesap silinemedi.");
      }

      window.location.href = "/";
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Hesap silinemedi. Biraz sonra tekrar dene.",
      );
      setLoading(false);
    }
  }

  return (
    <div>
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
      <div className="settings-row">
        <div>
          <strong>Hesabı sil</strong>
          <p>Silindikten sonra geri alınamaz.</p>
        </div>
        <button
          type="button"
          className="settings-edit settings-edit--danger"
          onClick={() => void onDelete()}
          disabled={loading}
        >
          {loading ? "Siliniyor…" : "Sil"}
        </button>
      </div>
    </div>
  );
}
