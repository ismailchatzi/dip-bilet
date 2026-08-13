import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountShell } from "@/components/account/AccountShell";
import { requireAuthOnboarding } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Destek ve talep — Dip Bilet",
};

export const dynamic = "force-dynamic";

export default async function DestekPage() {
  const supabase = await createClient();
  const { redirect: to } = await requireAuthOnboarding(supabase, {
    allowIncomplete: false,
  });
  if (to) redirect(to);

  return (
    <AccountShell title="Destek ve talep">
      <div className="settings-block">
        <p className="account-muted">
          Bu sayfa yakında açılacak. Şimdilik{" "}
          <a href="mailto:info@dipbilet.com">info@dipbilet.com</a> adresine
          yazabilirsin.
        </p>
      </div>
    </AccountShell>
  );
}
