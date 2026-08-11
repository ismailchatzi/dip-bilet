import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { AccountNav } from "@/components/account/AccountNav";

export function AccountShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main>
      <div className="site-shell">
        <SiteHeader />
        <section className="account-page">
          <h1>{title}</h1>
          <AccountNav />
          <div className="account-page__content">{children}</div>
        </section>
        <SiteFooter />
      </div>
    </main>
  );
}
