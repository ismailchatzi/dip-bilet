import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountDetails } from "@/components/account/AccountDetails";
import { AccountShell } from "@/components/account/AccountShell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Hesap bilgileri — Dip Bilet",
};

export const dynamic = "force-dynamic";

export default async function HesapBilgileriPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/giris");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/giris");

  return (
    <AccountShell title="Hesap bilgileri">
      <AccountDetails />
    </AccountShell>
  );
}
