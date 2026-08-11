"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountMenu } from "@/components/account/AccountMenu";
import { createClient } from "@/lib/supabase/client";

export function SiteHeader() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setLoggedIn(false);
      return;
    }

    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) setLoggedIn(Boolean(data.user));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session?.user));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="Dip Bilet">
        <Image
          className="brand-logo"
          src="/logo-db.png?v=3"
          alt=""
          width={242}
          height={163}
          priority
          unoptimized
        />
        <span className="brand-wordmark">Dip Bilet</span>
      </Link>

      {loggedIn ? (
        <AccountMenu />
      ) : (
        <Link
          className="btn btn-login"
          href="/giris"
          style={loggedIn === null ? { visibility: "hidden" } : undefined}
          aria-hidden={loggedIn === null}
          tabIndex={loggedIn === null ? -1 : undefined}
        >
          Giriş Yap
        </Link>
      )}
    </header>
  );
}
