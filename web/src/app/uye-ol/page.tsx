import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { AuthSplit } from "@/components/AuthSplit";
import { postAuthPath, fetchOnboardingProfile } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Ücretsiz Üye Ol — Dip Bilet",
  description:
    "Dip Bilet Kulübü’ne katıl, dip fırsatlardan anında haberin olsun.",
};

export default async function UyeOlPage() {
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
    <AuthSplit title="Kulübe katıl.">
      <Suspense fallback={<div className="auth-card">Yükleniyor...</div>}>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthSplit>
  );
}
