import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { AuthSplit } from "@/components/AuthSplit";
import { postAuthPath, fetchOnboardingProfile } from "@/lib/onboarding";
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
    if (user) {
      const profile = await fetchOnboardingProfile(supabase, user.id);
      redirect(postAuthPath(profile));
    }
  }

  return (
    <AuthSplit title="Tekrar hoş geldin.">
      <Suspense fallback={<div className="auth-card">Yükleniyor...</div>}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthSplit>
  );
}
