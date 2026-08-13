import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export function AccountShell({
  title,
  wide = false,
  hideTitle = false,
  children,
}: {
  title: string;
  wide?: boolean;
  hideTitle?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="home-light account-light">
      <SiteHeader />
      <main>
        <div className={wide ? "account-wrap account-wrap--vitrin" : "account-wrap"}>
          <section className="account-page">
            {hideTitle ? <h1 className="sr-only">{title}</h1> : <h1>{title}</h1>}
            <div className="account-page__content">{children}</div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
