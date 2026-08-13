import type { SupabaseClient } from "@supabase/supabase-js";

export type OnboardingProfile = {
  onboarding_step: number;
  onboarding_completed_at: string | null;
  departure_code: string | null;
  destination_codes: string[] | null;
};

export function onboardingStepPath(step: number): string {
  if (step >= 2) return "/onboarding/bildirimler";
  if (step >= 1) return "/onboarding/destinasyonlar";
  return "/onboarding/kalkis";
}

export function postAuthPath(profile: OnboardingProfile | null | undefined) {
  if (profile?.onboarding_completed_at) return "/firsatlarim";
  return onboardingStepPath(profile?.onboarding_step ?? 0);
}

export async function fetchOnboardingProfile(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data } = await supabase
    .from("profiles")
    .select(
      "onboarding_step, onboarding_completed_at, departure_code, destination_codes",
    )
    .eq("id", userId)
    .maybeSingle();

  return data as OnboardingProfile | null;
}

export async function requireAuthOnboarding(
  supabase: SupabaseClient | null,
  options: { allowIncomplete?: boolean; allowComplete?: boolean } = {},
) {
  if (!supabase) return { redirect: "/giris" as const, user: null, profile: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { redirect: "/giris" as const, user: null, profile: null };

  const profile = await fetchOnboardingProfile(supabase, user.id);
  const completed = Boolean(profile?.onboarding_completed_at);

  if (options.allowComplete === false && completed) {
    return { redirect: "/firsatlarim" as const, user, profile };
  }

  if (options.allowIncomplete === false && !completed) {
    return {
      redirect: onboardingStepPath(profile?.onboarding_step ?? 0) as string,
      user,
      profile,
    };
  }

  return { redirect: null, user, profile };
}
