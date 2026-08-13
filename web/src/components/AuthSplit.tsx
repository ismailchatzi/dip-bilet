import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";

export function AuthSplit({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="home-light auth-split">
      <SiteHeader logoOnly />

      <div className="auth-split__body">
        <div className="auth-split__form">
          <h1>{title}</h1>
          {children}
        </div>
        <div className="auth-split__visual" aria-hidden="true">
          <img src="/auth-side.png" alt="" />
        </div>
      </div>
    </div>
  );
}
