import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Ücretsiz Üye Ol — Dip Bilet",
  description: "Dip Bilet Kulübü’ne katıl, dip fırsatlardan anında haberin olsun.",
};

export default async function UyeOlPage() {
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/?hesap=firsatlar");
  }

  return (
    <main>
      <div className="site-shell">
        <SiteHeader />

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
