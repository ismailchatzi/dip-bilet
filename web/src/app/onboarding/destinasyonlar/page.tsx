import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingDestinations } from "@/components/onboarding/OnboardingDestinations";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { requireAuthOnboarding } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Destinasyonları seç — Dip Bilet",
};

export const dynamic = "force-dynamic";

export default async function OnboardingDestinasyonlarPage() {
  const supabase = await createClient();
  const { redirect: to, profile } = await requireAuthOnboarding(supabase, {
    allowComplete: false,
  });
  if (to) redirect(to);

  const step = profile?.onboarding_step ?? 0;
  if (step < 1) redirect("/onboarding/kalkis");
  if (step >= 2) redirect("/onboarding/bildirimler");

  return (
    <OnboardingShell
      step={2}
      title="Hayal destinasyonlarını seç"
      lead="Takip etmek istediğin şehirleri işaretle. Sürpriz dip rotalarını da tararız."
    >
      <OnboardingDestinations
        initialCodes={profile?.destination_codes ?? []}
      />
    </OnboardingShell>
  );
}
