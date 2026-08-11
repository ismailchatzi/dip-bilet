"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");

  useEffect(() => {
    const tab = searchParams.get("hesap");
    if (tab === "firsatlar" || tab === "deals") {
      setOpen(true);
      setView("deals");
    } else if (tab === "bilgi" || tab === "details") {
      setOpen(true);
      setView("details");
    } else if (tab === "bildirim" || tab === "notifications") {
      setOpen(true);
      setView("notifications");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!open) return;

    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setView("menu");
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setView("menu");
      }
    }
    // click: mousedown menü öğesinden önce kapanmasın
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/";
  }

  function openView(next: View) {
    setView(next);
    setOpen(true);
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <button
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
            setOpen(true);
            setView("menu");
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

      {open ? (
        <div
          className={[
            "account-popover",
            view !== "menu" ? "account-popover--panel" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="dialog"
          aria-label="Hesap menüsü"
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
                    router.replace("/", { scroll: false });
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
        </div>
      ) : null}
    </div>
  );
}
