import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Giriş Yap — Dip Bilet",
};

export default function GirisPage() {
  return (
    <main>
      <div className="site-shell">
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
        </header>

        <section className="auth-hero">
          <h1>Giriş yap</h1>
          <p>Dip Bilet Kulübü hesabınla devam et.</p>
        </section>

        <Suspense fallback={<div className="auth-card">Yükleniyor...</div>}>
          <AuthForm mode="login" />
        </Suspense>
        <SiteFooter />
      </div>
    </main>
  );
}
