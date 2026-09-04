import { NextResponse } from "next/server";
import {
  adminPasswordConfigured,
  isAdminAuthed,
} from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    authed: await isAdminAuthed(),
    configured: adminPasswordConfigured(),
  });
}
