import type { Metadata } from "next";
import { AdminVitrinPanel } from "@/components/AdminVitrinPanel";

export const metadata: Metadata = {
  title: "Admin — Dip Bilet",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="site-shell admin-page">
      <AdminVitrinPanel />
    </main>
  );
}
