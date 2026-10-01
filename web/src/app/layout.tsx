import type { Metadata } from "next";
import { Calistoga, Permanent_Marker, Roboto_Slab } from "next/font/google";
import Script from "next/script";
import { SignupTracker } from "@/components/SignupTracker";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import "./globals.css";

/** Cooper Black tarzı kalın display — logo/vitrin hariç genel yazı */
const display = Calistoga({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: "400",
});

const body = Calistoga({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  weight: "400",
});

const graffiti = Permanent_Marker({
  variable: "--font-graffiti",
  subsets: ["latin"],
  weight: "400",
});

/** Logo + “İSTANBUL KALKIŞLI…” — dokunulmaz */
const slab = Roboto_Slab({
  variable: "--font-slab",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Dip Bilet — Dip uçuş fırsatları",
  description:
    "Kalkışını seç. Biz arka planda tararız; ortalamanın altındaki biletleri sana getiririz.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${display.variable} ${body.variable} ${graffiti.variable} ${slab.variable} h-full`}
    >
      <head>
        {/* Impact — Skyscanner site sahipliği (value = Impact’in beklediği alan) */}
        <meta
          name="impact-site-verification"
          content="9d9c3fee-8d91-4467-a252-41372572f366"
          {...{ value: "9d9c3fee-8d91-4467-a252-41372572f366" }}
        />
        {/* Travelpayouts Drive — doğrulama ham HTML'de bu URL'yi arıyor */}
        <script
          async
          data-cmp-ab="2"
          src="https://emridco.com/NTYwNDc1.js?t=560475"
        />
      </head>
      <body className={`${body.className} min-h-full antialiased`}>
        {children}
        {process.env.NODE_ENV === "production" ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');`}
            </Script>
            <SignupTracker />
          </>
        ) : null}
      </body>
    </html>
  );
}
