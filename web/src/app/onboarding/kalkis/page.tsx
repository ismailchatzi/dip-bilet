import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingDeparture } from "@/components/onboarding/OnboardingDeparture";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { requireAuthOnboarding } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Kalkış yeri seç — Dip Bilet",
};

export const dynamic = "force-dynamic";

export default async function OnboardingKalkisPage() {
  const supabase = await createClient();
  const { redirect: to, profile } = await requireAuthOnboarding(supabase, {
    allowComplete: false,
  });
  if (to) redirect(to);

  const step = profile?.onboarding_step ?? 0;
  if (step >= 2) redirect("/onboarding/bildirimler");
  if (step >= 1) redirect("/onboarding/destinasyonlar");

  return (
    <OnboardingShell
      step={1}
      title="Kalkış yerini seç"
      lead="Dip taramaları seçtiğin kalkışa göre çalışır. Şimdilik İstanbul açık; diğer şehirler sırada."
    >
      <OnboardingDeparture initialCode={profile?.departure_code ?? "IST"} />
    </OnboardingShell>
  );
}
