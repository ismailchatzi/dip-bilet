"use client";

import { useEffect, useState } from "react";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { PhoneVerify } from "@/components/account/PhoneVerify";
import { createClient } from "@/lib/supabase/client";

export function AccountSettings() {
  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [editingPassword, setEditingPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
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
    setEditingEmail(false);
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
    setEditingPassword(false);
    setMsg("Şifren güncellendi.");
    setLoading(false);
  }

  function onPhoneVerified(next: string) {
    setPhone(next);
    setPhoneVerified(true);
    setEditingPhone(false);
    setMsg("Telefon numaran doğrulandı. SMS bildirimlerini uçuş ayarlarından açabilirsin.");
  }

  return (
    <div className="settings-page">
      {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
      {msg ? <p className="auth-alert auth-alert--ok">{msg}</p> : null}

      <section className="settings-section">
        <h2>Kişisel bilgiler</h2>

        <div className="settings-row">
          <div>
            <strong>E-posta</strong>
            {editingEmail ? (
              <div className="settings-inline">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  autoComplete="email"
                />
                <button
                  type="button"
                  className="btn btn-onboarding-secondary"
                  disabled={loading}
                  onClick={() => void saveEmail()}
                >
                  Kaydet
                </button>
              </div>
            ) : (
              <p>{email || "—"}</p>
            )}
          </div>
          {!editingEmail ? (
            <button
              type="button"
              className="settings-edit"
              onClick={() => setEditingEmail(true)}
            >
              Düzenle
            </button>
          ) : (
            <button
              type="button"
              className="settings-edit"
              onClick={() => {
                setEditingEmail(false);
                setNewEmail(email);
              }}
            >
              İptal
            </button>
          )}
        </div>

        <div className="settings-row">
          <div>
            <strong>Telefon</strong>
            {editingPhone ? (
              <PhoneVerify
                phone={phone}
                onPhoneChange={(v) => {
                  setPhone(v);
                  setPhoneVerified(false);
                }}
                verified={phoneVerified}
                onVerified={onPhoneVerified}
                disabled={loading}
              />
            ) : (
              <p>
                {phone || "Eklenmedi"}
                {phoneVerified ? " · doğrulandı" : ""}
              </p>
            )}
          </div>
          {!editingPhone ? (
            <button
              type="button"
              className="settings-edit"
              onClick={() => setEditingPhone(true)}
            >
              Düzenle
            </button>
          ) : (
            <button
              type="button"
              className="settings-edit"
              onClick={() => setEditingPhone(false)}
            >
              İptal
            </button>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h2>Güvenlik</h2>
        <div className="settings-row">
          <div>
            <strong>Şifre</strong>
            {editingPassword ? (
              <div className="settings-inline settings-inline--stack">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Yeni şifre"
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  placeholder="Şifre tekrar"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="btn btn-onboarding-secondary"
                  disabled={loading}
                  onClick={() => void savePassword()}
                >
                  Güncelle
                </button>
              </div>
            ) : (
              <p>••••••</p>
            )}
          </div>
          {!editingPassword ? (
            <button
              type="button"
              className="settings-edit"
              onClick={() => setEditingPassword(true)}
            >
              Düzenle
            </button>
          ) : (
            <button
              type="button"
              className="settings-edit"
              onClick={() => {
                setEditingPassword(false);
                setPassword("");
                setPassword2("");
              }}
            >
              İptal
            </button>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h2>Hesabı yönet</h2>
        <DeleteAccountButton />
      </section>
    </div>
  );
}
