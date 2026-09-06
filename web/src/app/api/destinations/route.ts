import { optionsFromSeenDestinations } from "@/lib/destinations";
import {
  emptyDealsPayload,
  patchScanBoard,
  readScanBoard,
} from "@/lib/scan/board";
import { mergeSeenDestinations } from "@/lib/scan/seen-destinations";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Hayal destinasyon seçenekleri: Scrappa 21 + vitrinde görülmüş şehirler. */
export async function GET() {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { destinations: optionsFromSeenDestinations([]) },
        { status: 200 },
      );
    }
    const board = await readScanBoard(admin);
    const deals = board.deals ?? emptyDealsPayload();
    const catalog = mergeSeenDestinations(
      deals.seenDestinations,
      [...(deals.deals ?? []), ...(deals.archive ?? [])],
      deals.fetchedAt || new Date().toISOString(),
    );

    if (
      !deals.seenDestinations?.length ||
      deals.seenDestinations.length < catalog.length
    ) {
      await patchScanBoard(admin, {
        deals: { ...deals, seenDestinations: catalog },
      });
    }

    return NextResponse.json(
      { destinations: optionsFromSeenDestinations(catalog) },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      },
    );
  } catch (err) {
    console.error("destinations:", err);
    return NextResponse.json(
      { destinations: optionsFromSeenDestinations([]) },
      { status: 200 },
    );
  }
}
