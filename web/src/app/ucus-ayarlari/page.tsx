import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FlightSettings } from "@/components/account/FlightSettings";
import { AccountShell } from "@/components/account/AccountShell";
import { requireAuthOnboarding } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Uçuş ayarları — Dip Bilet",
};

export const dynamic = "force-dynamic";

export default async function UcusAyarlariPage() {
  const supabase = await createClient();
  const { redirect: to } = await requireAuthOnboarding(supabase, {
    allowIncomplete: false,
  });
  if (to) redirect(to);

  return (
    <AccountShell title="Uçuş ayarları">
      <FlightSettings />
    </AccountShell>
  );
}
