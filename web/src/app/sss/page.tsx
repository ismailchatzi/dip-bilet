import type { Metadata } from "next";
import Link from "next/link";
import { HomeFaq } from "@/components/home/HomeFaq";

export const metadata: Metadata = {
  title: "SSS — Dip Bilet",
  description: "Dip Bilet hakkında sıkça sorulan sorular.",
};

export default function SssPage() {
  return (
    <main className="legal-page">
      <div className="site-shell">
        <p className="legal-back">
          <Link href="/">← Dip Bilet’e dön</Link>
        </p>
        <HomeFaq />
      </div>
    </main>
  );
}
