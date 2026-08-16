import type { Metadata } from "next";
import { Calistoga, Permanent_Marker, Roboto_Slab } from "next/font/google";
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
        {/* Travelpayouts Drive — doğrulama ham HTML'de bu URL'yi arıyor */}
        <script
          async
          data-cmp-ab="2"
          src="https://emridco.com/NTYwNDc1.js?t=560475"
        />
      </head>
      <body className={`${body.className} min-h-full antialiased`}>{children}</body>
    </html>
  );
}
