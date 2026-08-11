import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountNotifications } from "@/components/account/AccountNotifications";
import { AccountShell } from "@/components/account/AccountShell";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Bildirim ayarları — Dip Bilet",
};

export const dynamic = "force-dynamic";

export default async function BildirimAyarlariPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/giris");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/giris");

  return (
    <AccountShell title="Bildirim ayarları">
      <AccountNotifications />
    </AccountShell>
  );
}
