"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function Toast({
  message,
  onClose,
  durationMs = 5500,
}: {
  message: string;
  onClose: () => void;
  durationMs?: number;
}) {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLeaving(false);
    const fadeAt = window.setTimeout(() => setLeaving(true), durationMs);
    const removeAt = window.setTimeout(onClose, durationMs + 450);
    return () => {
      window.clearTimeout(fadeAt);
      window.clearTimeout(removeAt);
    };
  }, [message, durationMs, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={["app-toast", leaving ? "app-toast--leave" : ""].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
    >
      <p className="app-toast__text">{message}</p>
      <button
        type="button"
        className="app-toast__close"
        aria-label="Bildirimi kapat"
        onClick={onClose}
      >
        ×
      </button>
    </div>,
    document.body,
  );
}
