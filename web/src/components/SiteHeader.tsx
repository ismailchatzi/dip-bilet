import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  let loggedIn = false;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    loggedIn = Boolean(user);
  }

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
        <Link
          className="profile-chip"
          href="/panel"
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
        <Link className="btn btn-login" href="/giris">
          Giriş Yap
        </Link>
      )}
    </header>
  );
}
