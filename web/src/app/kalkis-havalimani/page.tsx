import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DepartureSelect } from "@/components/DepartureSelect";
import { AccountShell } from "@/components/account/AccountShell";
import { requireAuthOnboarding } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Kalkış havalimanı — Dip Bilet",
};

export const dynamic = "force-dynamic";

export default async function KalkisHavalimaniPage() {
  const supabase = await createClient();
  const { redirect: to, profile } = await requireAuthOnboarding(supabase, {
    allowIncomplete: false,
  });
  if (to) redirect(to);

  return (
    <AccountShell title="Kalkış havalimanı">
      <DepartureSelect initialCode={profile?.departure_code ?? "IST"} />
    </AccountShell>
  );
}
