import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "Ücretsiz Üye Ol — Dip Bilet",
  description: "Dip Bilet Kulübü’ne katıl, dip fırsatlardan anında haberin olsun.",
};

export default function UyeOlPage() {
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
          <h1>Kulübe katıl</h1>
          <p>
            Ücretsiz üye ol. Hata fiyatı, flaş indirim ve ortalamanın çok altına
            inen biletlerden haberin olsun.
          </p>
        </section>

        <Suspense fallback={<div className="auth-card">Yükleniyor...</div>}>
          <AuthForm mode="signup" />
        </Suspense>
        <SiteFooter />
      </div>
    </main>
  );
}
