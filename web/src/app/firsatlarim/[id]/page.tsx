import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccountShell } from "@/components/account/AccountShell";
import { DealDetail } from "@/components/vitrin/DealDetail";
import {
  dealCityTitle,
  dealDateChoices,
  dealDestCode,
  dealWithDateChoice,
  dealWithinStopLimit,
  foldOneCardPerCity,
  isUnverifiedOneWaySum,
} from "@/lib/deal-display";
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
  const live = foldOneCardPerCity(
    (board.deals?.deals ?? []).filter(
      (d) =>
        isLiveDeal(d) && dealWithinStopLimit(d) && !isUnverifiedOneWaySum(d),
    ),
  );
  const deal =
    live.find((d) => d.id === id) ??
    live.find((d) =>
      dealDateChoices(d).some((c) => dealWithDateChoice(d, c).id === id),
    );
  if (!deal) notFound();
  const dest = dealDestCode(deal);
  const cityDeals = live.filter((d) => dealDestCode(d) === dest);

  return (
    <AccountShell title={dealCityTitle(deal)} wide hideTitle>
      <DealDetail deal={deal} cityDeals={cityDeals} focusId={id} />
    </AccountShell>
  );
}
