import { redirect } from "next/navigation";
import { onboardingStepPath, requireAuthOnboarding } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingIndexPage() {
  const supabase = await createClient();
  const { redirect: to, profile } = await requireAuthOnboarding(supabase, {
    allowComplete: false,
  });
  if (to && to !== "/giris") redirect(onboardingStepPath(profile?.onboarding_step ?? 0));
  if (to) redirect(to);
  redirect("/onboarding/kalkis");
}
