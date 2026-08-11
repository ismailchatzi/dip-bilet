import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountDeals } from "@/components/account/AccountDeals";
import { AccountShell } from "@/components/account/AccountShell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Fırsat uçuşlarım — Dip Bilet",
};

export const dynamic = "force-dynamic";

export default async function FirsatlarimPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/giris");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/giris");

  return (
    <AccountShell title="Fırsat uçuşlarım">
      <AccountDeals />
    </AccountShell>
  );
}
