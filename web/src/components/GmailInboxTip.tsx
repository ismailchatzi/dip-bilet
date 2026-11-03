"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "dipbilet_gmail_inbox_tip_seen_v1";
const DURATION_MS = 20_000;

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
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setLeaving(true);
    window.setTimeout(() => setVisible(false), 320);
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      return;
    }
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
        <li>Gmail’de Dip Bilet mailini açın</li>
        <li>
          <strong>Ana Gelen Kutusu</strong>na taşıyın
        </li>
        <li>
          “Gelecekteki iletiler için de uygula?” → <strong>Evet</strong>
        </li>
      </ol>
    </div>
  );
}
