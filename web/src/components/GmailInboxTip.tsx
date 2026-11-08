"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SESSION_KEY = "dipbilet_gmail_inbox_tip_session";
const DURATION_MS = 20_000;

/**
 * SPA içinde sayfa/kart geçişinde component remount olsa bile aynı JS
 * bağlamında bir daha gösterme. Sekme tamamen kapanınca hem bu flag hem
 * sessionStorage sıfırlanır → sonraki ziyarette tekrar çıkar.
 */
let shownThisTab = false;

/** Girişte temizlenir; sekme kapanınca sessionStorage zaten silinir. */
export function clearGmailInboxTipSession() {
  shownThisTab = false;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function markTipSeen() {
  shownThisTab = true;
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function GmailInboxTip() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(1);
  const remainingRef = useRef(DURATION_MS);
  const lastTickRef = useRef(0);
  const pausedRef = useRef(false);
  const closedRef = useRef(false);

  const dismiss = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    markTipSeen();
    setLeaving(true);
    window.setTimeout(() => setVisible(false), 320);
  }, []);

  useEffect(() => {
    try {
      if (shownThisTab || sessionStorage.getItem(SESSION_KEY) === "1") {
        shownThisTab = true;
        return;
      }
    } catch {
      if (shownThisTab) return;
    }
    markTipSeen();
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible || leaving) return;
    lastTickRef.current = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      if (!pausedRef.current) {
        remainingRef.current = Math.max(
          0,
          remainingRef.current - (now - lastTickRef.current),
        );
        setProgress(remainingRef.current / DURATION_MS);
        if (remainingRef.current <= 0) {
          dismiss();
          return;
        }
      }
      lastTickRef.current = now;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, leaving, dismiss]);

  if (!visible) return null;

  return (
    <div
      className={[
        "gmail-inbox-tip",
        leaving ? "gmail-inbox-tip--leave" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
      aria-live="polite"
      onMouseEnter={() => {
        pausedRef.current = true;
      }}
      onMouseLeave={() => {
        pausedRef.current = false;
        lastTickRef.current = performance.now();
      }}
    >
      <div
        className="gmail-inbox-tip__bar"
        aria-hidden="true"
      >
        <span
          className="gmail-inbox-tip__bar-fill"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <button
        type="button"
        className="gmail-inbox-tip__close"
        aria-label="Kapat"
        onClick={dismiss}
      >
        ×
      </button>
      <p className="gmail-inbox-tip__kicker">Önemli</p>
      <p className="gmail-inbox-tip__lead">
        Fırsat maillerinin telefonda bildirim vermesi için Dip Bilet’i Ana Gelen
        Kutusu’na alın.
      </p>
      <ol className="gmail-inbox-tip__steps">
        <li>
          Telefon: maile tıklayın → <strong>Taşı</strong> (sağ ok) →{" "}
          <strong>Birincil</strong>
        </li>
        <li>
          Bilgisayar: gelen maili <strong>Birincil</strong> sekmesine sürükleyin
        </li>
        <li>
          “Gelecekteki iletiler için de uygula?” → <strong>Evet</strong>
        </li>
      </ol>
    </div>
  );
}
