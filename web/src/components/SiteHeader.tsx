"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
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
    <header className="site-header-sticky">
      <div className="site-header-sticky__inner">
        <Link className="brand brand--light" href="/" aria-label="Dip Bilet">
          <Image
            className="brand-logo"
            src="/logo-db.png?v=3"
            alt=""
            width={242}
            height={163}
            priority
            unoptimized
          />
          <span className="brand-wordmark brand-wordmark--graffiti">
            Dip Bilet
          </span>
        </Link>

        <div className="site-header-sticky__actions">
          {loggedIn ? (
            <Link
              className="profile-chip profile-chip--light"
              href="/firsatlarim"
              aria-label="Hesabım"
              title="Hesabım"
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
            </Link>
          ) : (
            <>
              <Link className="header-login" href="/giris">
                Giriş Yap
              </Link>
              <Link className="btn btn-header-join" href="/uye-ol">
                Ücretsiz üye ol →
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
