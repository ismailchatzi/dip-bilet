"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MENU_PRIMARY = [
  { href: "/firsatlarim", label: "Uçuş vitrini" },
  { href: "/hedef-destinasyonlar", label: "Hedef destinasyonlar" },
  { href: "/ucus-ayarlari", label: "Uçuş ayarları" },
  { href: "/hesap-ayarlari", label: "Hesap ayarları" },
] as const;

const MENU_SECONDARY = [
  { href: "/destek", label: "Destek ve talep" },
] as const;

export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="profile-menu" ref={wrapRef}>
      <button
        type="button"
        className="profile-chip profile-chip--light"
        aria-label="Hesap menüsü"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
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
        <div className="profile-menu__panel" role="menu">
          <div className="profile-menu__group">
            {MENU_PRIMARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="profile-menu__item"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="profile-menu__group">
            {MENU_SECONDARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="profile-menu__item"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              role="menuitem"
              className="profile-menu__item profile-menu__item--danger"
              onClick={() => void signOut()}
            >
              Çıkış yap
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
