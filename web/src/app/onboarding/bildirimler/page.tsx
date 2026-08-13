import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingNotifications } from "@/components/onboarding/OnboardingNotifications";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { requireAuthOnboarding } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Bildirim ayarları — Dip Bilet",
};

export const dynamic = "force-dynamic";

export default async function OnboardingBildirimlerPage() {
  const supabase = await createClient();
  const { redirect: to, user, profile } = await requireAuthOnboarding(
    supabase,
    { allowComplete: false },
  );
  if (to) redirect(to);

  const step = profile?.onboarding_step ?? 0;
  if (step < 2) redirect("/onboarding/destinasyonlar");

  return (
    <OnboardingShell
      step={3}
      title="Nasıl haberdar olmak istersin?"
      lead="Dip fırsat yakalandığında sana ulaşalım. E-posta varsayılan olarak açık."
    >
      <OnboardingNotifications initialEmail={user?.email ?? ""} />
    </OnboardingShell>
  );
}
