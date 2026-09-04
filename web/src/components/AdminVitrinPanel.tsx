"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Destination = { code: string; name: string };

type ManualDeal = {
  id: string;
  destination: string;
  price: number;
  outboundDate?: string;
  returnDate?: string;
  airline?: string;
};

type FormState = {
  destCode: string;
  cityName: string;
  quickPick: string;
  outboundDate: string;
  returnDate: string;
  price: string;
  referencePrice: string;
  origin: "IST" | "SAW";
  returnOrigin: "IST" | "SAW" | "";
  airline: string;
  googleFlightsUrl: string;
  dealBadge: "MUTLAK_FIRSAT" | "SEZONLUK_DIP";
  stops: string;
  photoUrl: string;
  conflictAction: "" | "attach" | "replace";
};

const emptyForm = (): FormState => ({
  destCode: "",
  cityName: "",
  quickPick: "",
  outboundDate: "",
  returnDate: "",
  price: "",
  referencePrice: "",
  origin: "IST",
  returnOrigin: "",
  airline: "",
  googleFlightsUrl: "",
  dealBadge: "MUTLAK_FIRSAT",
  stops: "",
  photoUrl: "",
  conflictAction: "",
});

export function AdminVitrinPanel() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState("");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [manual, setManual] = useState<ManualDeal[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [conflict, setConflict] = useState<string | null>(null);

  const loadDeals = useCallback(async () => {
    const res = await fetch("/api/admin/deals", { cache: "no-store" });
    if (!res.ok) throw new Error("Liste alınamadı");
    const data = (await res.json()) as {
      destinations: Destination[];
      manual: ManualDeal[];
    };
    setDestinations(data.destinations);
    setManual(data.manual);
  }, []);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      const data = (await res.json()) as { authed: boolean; configured: boolean };
      setConfigured(data.configured);
      setAuthed(data.authed);
      if (data.authed) await loadDeals();
    } catch {
      setError("Oturum kontrol edilemedi");
    } finally {
      setLoading(false);
    }
  }, [loadDeals]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Giriş başarısız");
        return;
      }
      setPassword("");
      setAuthed(true);
      await loadDeals();
    } catch {
      setError("Giriş isteği başarısız");
    } finally {
      setSubmitting(false);
    }
  }

  async function onLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setManual([]);
    setForm(emptyForm());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setConflict(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destCode: form.destCode,
          cityName: form.cityName || undefined,
          outboundDate: form.outboundDate,
          returnDate: form.returnDate,
          price: form.price,
          referencePrice:
            form.referencePrice === "" ? undefined : Number(form.referencePrice),
          origin: form.origin,
          returnOrigin: form.returnOrigin || form.origin,
          airline: form.airline || undefined,
          googleFlightsUrl: form.googleFlightsUrl || undefined,
          dealBadge: form.dealBadge,
          stops: form.stops === "" ? undefined : Number(form.stops),
          photoUrl: form.photoUrl || undefined,
          conflictAction: form.conflictAction || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        deal?: ManualDeal;
        needsChoice?: boolean;
      };
      if (!res.ok) {
        if (data.needsChoice) {
          setConflict(data.error ?? "Şehirde kart var — yol seç.");
        } else {
          setError(data.error ?? "Kayıt başarısız");
        }
        return;
      }
      setMessage(
        `${data.deal?.destination ?? "Kart"} kaydedildi ($${data.deal?.price}).`,
      );
      setForm(emptyForm());
      setConflict(null);
      await loadDeals();
    } catch {
      setError("Kayıt isteği başarısız");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeleteManual(id: string) {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/deals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Silinemedi");
      return;
    }
    setMessage("Manuel kart silindi.");
    await loadDeals();
  }

  if (loading) {
    return (
      <div className="auth-card">
        <p className="auth-lead">Yükleniyor…</p>
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="auth-card">
        <p className="auth-lead">
          <code>ADMIN_PASSWORD</code> .env.local içinde tanımlı değil.
        </p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="auth-card">
        <h1 className="admin-vitrin__title">Vitrin admin</h1>
        <p className="admin-vitrin__lead">Manuel fırsat eklemek için şifre gir.</p>
        <form className="auth-form" onSubmit={onLogin}>
          <label className="auth-field">
            <span>Şifre</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
          <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
            {submitting ? "Giriş…" : "Giriş"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-vitrin">
      <div className="auth-card admin-vitrin__card">
        <div className="admin-vitrin__head">
          <div>
            <h1 className="admin-vitrin__title">Vitrin admin</h1>
            <p className="admin-vitrin__lead">Fly4free tarzı manuel kart ekle.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onLogout()}>
            Çıkış
          </button>
        </div>

        <form className="auth-form admin-vitrin__form" onSubmit={onSubmit}>
          <label className="auth-field">
            <span>Hızlı seç (21 takip edilen)</span>
            <select
              value={form.quickPick}
              onChange={(e) => {
                const code = e.target.value;
                const hit = destinations.find((d) => d.code === code);
                setForm((f) => ({
                  ...f,
                  quickPick: code,
                  destCode: code,
                  cityName: hit?.name ?? f.cityName,
                }));
              }}
            >
              <option value="">Manuel IATA yaz…</option>
              {destinations.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </label>

          <div className="admin-vitrin__row">
            <label className="auth-field">
              <span>IATA (herhangi bir şehir)</span>
              <input
                type="text"
                required
                maxLength={3}
                placeholder="LHR, DXB, ATH…"
                value={form.destCode}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    destCode: e.target.value.toUpperCase(),
                    quickPick: "",
                  }))
                }
              />
            </label>
            <label className="auth-field">
              <span>Şehir adı</span>
              <input
                type="text"
                placeholder="Londra, Dubai… (listede yoksa zorunlu)"
                value={form.cityName}
                onChange={(e) => setForm((f) => ({ ...f, cityName: e.target.value }))}
              />
            </label>
          </div>

          <div className="admin-vitrin__row">
            <label className="auth-field">
              <span>Gidiş</span>
              <input
                type="date"
                required
                value={form.outboundDate}
                onChange={(e) => setForm((f) => ({ ...f, outboundDate: e.target.value }))}
              />
            </label>
            <label className="auth-field">
              <span>Dönüş</span>
              <input
                type="date"
                required
                value={form.returnDate}
                onChange={(e) => setForm((f) => ({ ...f, returnDate: e.target.value }))}
              />
            </label>
          </div>

          <div className="admin-vitrin__row">
            <label className="auth-field">
              <span>Fiyat (USD)</span>
              <input
                type="number"
                min={1}
                step={1}
                required
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </label>
            <label className="auth-field">
              <span>Referans / eski fiyat (isteğe bağlı)</span>
              <input
                type="number"
                min={1}
                step={1}
                placeholder="Üstü çizili için"
                value={form.referencePrice}
                onChange={(e) =>
                  setForm((f) => ({ ...f, referencePrice: e.target.value }))
                }
              />
            </label>
          </div>

          <div className="admin-vitrin__row">
            <label className="auth-field">
              <span>Gidiş kalkış</span>
              <select
                value={form.origin}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    origin: e.target.value as "IST" | "SAW",
                  }))
                }
              >
                <option value="IST">IST</option>
                <option value="SAW">SAW</option>
              </select>
            </label>
            <label className="auth-field">
              <span>Dönüş varış</span>
              <select
                value={form.returnOrigin}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    returnOrigin: e.target.value as "IST" | "SAW" | "",
                  }))
                }
              >
                <option value="">Gidiş ile aynı</option>
                <option value="IST">IST</option>
                <option value="SAW">SAW</option>
              </select>
            </label>
          </div>

          <label className="auth-field">
            <span>Havayolu (isteğe bağlı)</span>
            <input
              type="text"
              placeholder="Pegasus, Wizz…"
              value={form.airline}
              onChange={(e) => setForm((f) => ({ ...f, airline: e.target.value }))}
            />
          </label>

          <label className="auth-field">
            <span>Google Flights linki (isteğe bağlı)</span>
            <input
              type="url"
              placeholder="Boş bırakılırsa otomatik üretilir"
              value={form.googleFlightsUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, googleFlightsUrl: e.target.value }))
              }
            />
          </label>

          <label className="auth-field">
            <span>Kart görseli URL (yerel foto yoksa zorunlu)</span>
            <input
              type="url"
              placeholder="https://… — Google/Fly4free görsel adresi"
              value={form.photoUrl}
              onChange={(e) => setForm((f) => ({ ...f, photoUrl: e.target.value }))}
            />
          </label>

          <div className="admin-vitrin__row">
            <label className="auth-field">
              <span>Rozet</span>
              <select
                value={form.dealBadge}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    dealBadge: e.target.value as FormState["dealBadge"],
                  }))
                }
              >
                <option value="MUTLAK_FIRSAT">Mutlak fırsat</option>
                <option value="SEZONLUK_DIP">Sezonluk dip</option>
              </select>
            </label>
            <label className="auth-field">
              <span>Aktarma (isteğe bağlı)</span>
              <input
                type="number"
                min={0}
                max={3}
                placeholder="Boş = bilinmiyor"
                value={form.stops}
                onChange={(e) => setForm((f) => ({ ...f, stops: e.target.value }))}
              />
            </label>
          </div>

          {conflict ? (
            <div className="auth-alert auth-alert--error">
              <p>{conflict}</p>
              <div className="admin-vitrin__conflict-actions">
                <label className="admin-vitrin__check">
                  <input
                    type="radio"
                    name="conflictAction"
                    checked={form.conflictAction === "attach"}
                    onChange={() =>
                      setForm((f) => ({ ...f, conflictAction: "attach" }))
                    }
                  />
                  Diğer tarih olarak ekle (önerilen — eşik/görsel korunur)
                </label>
                <label className="admin-vitrin__check">
                  <input
                    type="radio"
                    name="conflictAction"
                    checked={form.conflictAction === "replace"}
                    onChange={() =>
                      setForm((f) => ({ ...f, conflictAction: "replace" }))
                    }
                  />
                  Kahramanı değiştir (görsel korunur; eşik seninkine döner)
                </label>
              </div>
            </div>
          ) : null}

          {error ? <p className="auth-alert auth-alert--error">{error}</p> : null}
          {message ? <p className="auth-alert auth-alert--ok">{message}</p> : null}

          <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
            {submitting ? "Kaydediliyor…" : "Vitrine ekle"}
          </button>
        </form>
      </div>

      {manual.length > 0 ? (
        <div className="auth-card admin-vitrin__card">
          <h2 className="admin-vitrin__subtitle">Mevcut manuel kartlar</h2>
          <ul className="admin-vitrin__list">
            {manual.map((d) => (
              <li key={d.id} className="admin-vitrin__list-row">
                <span>
                  <strong>{d.destination}</strong> — ${d.price}
                  {d.outboundDate && d.returnDate
                    ? ` · ${d.outboundDate} → ${d.returnDate}`
                    : null}
                  {d.airline ? ` · ${d.airline}` : null}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void onDeleteManual(d.id)}
                >
                  Sil
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
