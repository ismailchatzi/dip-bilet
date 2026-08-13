"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProfileMenu } from "@/components/ProfileMenu";
import { createClient } from "@/lib/supabase/client";

export function SiteHeader({ logoOnly = false }: { logoOnly?: boolean }) {
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
        <Link
          className="brand brand--light"
          href={loggedIn ? "/firsatlarim" : "/"}
          aria-label="Dip Bilet"
        >
          <Image
            className="brand-logo brand-logo--badge"
            src="/logo-db-badge.png"
            alt=""
            width={80}
            height={80}
            priority
            unoptimized
          />
          <span className="brand-wordmark brand-wordmark--graffiti">
            Dip Bilet
          </span>
        </Link>

        {logoOnly ? null : (
          <div className="site-header-sticky__actions">
            {loggedIn ? (
              <ProfileMenu />
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
        )}
      </div>
    </header>
  );
}
