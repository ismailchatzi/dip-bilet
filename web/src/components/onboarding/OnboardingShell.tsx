import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

const STEPS = [
  { n: 1, label: "Kalkış" },
  { n: 2, label: "Destinasyon" },
  { n: 3, label: "Bildirim" },
] as const;

export function OnboardingShell({
  step,
  title,
  lead,
  children,
}: {
  step: 1 | 2 | 3;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <div className="home-light onboarding-light">
      <header className="onboarding-top">
        <Link className="brand brand--light" href="/" aria-label="Dip Bilet">
          <Image
            className="brand-logo brand-logo--badge"
            src="/logo-db-badge.png"
            alt=""
            width={80}
            height={80}
            priority
            unoptimized
          />
          <span className="brand-wordmark brand-wordmark--graffiti">
            Dip Bilet
          </span>
        </Link>
      </header>

      <main className="onboarding-main">
        <ol className="onboarding-steps" aria-label="Kurulum adımları">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className={[
                "onboarding-steps__item",
                s.n === step ? "onboarding-steps__item--active" : "",
                s.n < step ? "onboarding-steps__item--done" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="onboarding-steps__num">{s.n}</span>
              <span className="onboarding-steps__label">{s.label}</span>
            </li>
          ))}
        </ol>

        <div className="onboarding-card">
          <h1>{title}</h1>
          {lead ? <p className="onboarding-lead">{lead}</p> : null}
          {children}
        </div>
      </main>
    </div>
  );
}
