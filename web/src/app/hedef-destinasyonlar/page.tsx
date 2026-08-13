import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DestinationSettings } from "@/components/account/DestinationSettings";
import { AccountShell } from "@/components/account/AccountShell";
import { requireAuthOnboarding } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Hedef destinasyonlar — Dip Bilet",
};

export const dynamic = "force-dynamic";

export default async function HedefDestinasyonlarPage() {
  const supabase = await createClient();
  const { redirect: to, profile } = await requireAuthOnboarding(supabase, {
    allowIncomplete: false,
  });
  if (to) redirect(to);

  return (
    <AccountShell title="Hedef destinasyonlar">
      <DestinationSettings initialCodes={profile?.destination_codes ?? []} />
    </AccountShell>
  );
}
