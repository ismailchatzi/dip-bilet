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
    <div className="account-danger">
      <h2>Hesap</h2>
      <p>Hesabını silersen tüm üyelik verin gider. Yeniden kayıt olabilirsin.</p>
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
      <button
        type="button"
        className="btn btn-danger"
        onClick={onDelete}
        disabled={loading}
      >
        {loading ? "Siliniyor..." : "Hesabımı sil"}
      </button>
    </div>
  );
}
