"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const LINKS = [
  { href: "/firsatlarim", label: "Fırsat uçuşlarım" },
  { href: "/hesap-bilgileri", label: "Hesap bilgileri" },
  { href: "/bildirim-ayarlari", label: "Bildirim ayarları" },
] as const;

export function AccountNav() {
  const pathname = usePathname();

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <nav className="account-nav" aria-label="Hesap">
      <div className="account-nav__links">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={
                active ? "account-nav__link account-nav__link--active" : "account-nav__link"
              }
            >
              {link.label}
            </Link>
          );
        })}
      </div>
      <button type="button" className="account-nav__logout" onClick={() => void signOut()}>
        Çıkış
      </button>
    </nav>
  );
}
