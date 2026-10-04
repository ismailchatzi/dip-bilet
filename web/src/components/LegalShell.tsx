import Link from "next/link";
import type { ReactNode } from "react";

export function LegalShell({
  title,
  updated = "10 Ağustos 2026",
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <main className="legal-page">
      <div className="site-shell">
        <p className="legal-back">
          <Link href="/">← Dip Bilet’e dön</Link>
        </p>
        <h1>{title}</h1>
        <p className="legal-updated">Son güncelleme: {updated}</p>
        <div className="legal-body">{children}</div>
      </div>
    </main>
  );
}
