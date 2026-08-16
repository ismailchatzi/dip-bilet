import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccountShell } from "@/components/account/AccountShell";
import { DealDetail } from "@/components/vitrin/DealDetail";
import { dealCityTitle } from "@/lib/deal-display";
import { requireAuthOnboarding } from "@/lib/onboarding";
import { readScanBoard } from "@/lib/scan/board";
import { isLiveDeal } from "@/lib/scan/deal-archive";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Fırsat — Dip Bilet" };
}

export default async function DealDetailPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const supabase = await createClient();
  const { redirect: to } = await requireAuthOnboarding(supabase, {
    allowIncomplete: false,
  });
  if (to) redirect(to);
  if (!supabase) notFound();

  const board = await readScanBoard(supabase);
  const deal = (board.deals?.deals ?? []).find((d) => d.id === id);
  if (!deal || !isLiveDeal(deal)) {
    notFound();
  }
  const dest = deal.id.split(":")[1] ?? "";
  const cityDeals = (board.deals?.deals ?? []).filter(
    (d) => isLiveDeal(d) && d.id.split(":")[1] === dest,
  );

  return (
    <AccountShell title={dealCityTitle(deal)} wide hideTitle>
      <DealDetail deal={deal} cityDeals={cityDeals} />
    </AccountShell>
  );
}
