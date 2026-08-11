"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AccountDeals } from "@/components/account/AccountDeals";
import { AccountDetails } from "@/components/account/AccountDetails";
import { AccountNotifications } from "@/components/account/AccountNotifications";
import { createClient } from "@/lib/supabase/client";

type View = "menu" | "deals" | "details" | "notifications";

const TITLES: Record<Exclude<View, "menu">, string> = {
  deals: "Fırsat uçuşlarım",
  details: "Hesap bilgileri",
  notifications: "Bildirim ayarları",
};

export function AccountMenu() {
  const chipRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function placePopover() {
    const chip = chipRef.current;
    if (!chip) return;
    const rect = chip.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    placePopover();
    function onResize() {
      placePopover();
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, view]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (chipRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
      setView("menu");
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setView("menu");
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/";
  }

  function openView(next: Exclude<View, "menu">) {
    setView(next);
    setOpen(true);
  }

  const popover =
    open && mounted
      ? createPortal(
          <div
            ref={popoverRef}
            className={[
              "account-popover",
              view !== "menu" ? "account-popover--panel" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              position: "fixed",
              top: coords.top,
              right: coords.right,
              left: "auto",
            }}
            role="dialog"
            aria-label="Hesap menüsü"
            onClick={(e) => e.stopPropagation()}
          >
            {view === "menu" ? (
              <nav className="account-popover__nav">
                <button type="button" onClick={() => openView("deals")}>
                  Fırsat uçuşlarım
                </button>
                <button type="button" onClick={() => openView("details")}>
                  Hesap bilgileri
                </button>
                <button type="button" onClick={() => openView("notifications")}>
                  Bildirim ayarları
                </button>
                <button
                  type="button"
                  className="account-popover__logout"
                  onClick={() => void signOut()}
                >
                  Çıkış
                </button>
              </nav>
            ) : (
              <>
                <div className="account-popover__head">
                  <button
                    type="button"
                    className="account-popover__back"
                    onClick={() => setView("menu")}
                  >
                    ← Menü
                  </button>
                  <strong>{TITLES[view]}</strong>
                  <button
                    type="button"
                    className="account-popover__close"
                    aria-label="Kapat"
                    onClick={() => {
                      setOpen(false);
                      setView("menu");
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="account-popover__body">
                  {view === "deals" ? <AccountDeals /> : null}
                  {view === "details" ? <AccountDetails /> : null}
                  {view === "notifications" ? <AccountNotifications /> : null}
                </div>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="account-menu">
      <button
        ref={chipRef}
        type="button"
        className="profile-chip"
        aria-label="Hesabım"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) {
            setOpen(false);
            setView("menu");
          } else {
            placePopover();
            setView("menu");
            setOpen(true);
          }
        }}
      >
        <svg
          className="profile-chip__icon"
          viewBox="0 0 24 24"
          width="22"
          height="22"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12Zm0 2.25c-3.6 0-7.5 1.8-7.5 4.5V20h15v-1.25c0-2.7-3.9-4.5-7.5-4.5Z"
          />
        </svg>
      </button>
      {popover}
    </div>
  );
}
