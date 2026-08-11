import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Giriş Yap — Dip Bilet",
};

export default async function GirisPage() {
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/");
  }

  return (
    <main>
      <div className="site-shell">
        <SiteHeader />

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
