import type { Metadata } from "next";
import { DM_Sans, Syne } from "next/font/google";
import { BackgroundMotifs } from "@/components/BackgroundMotifs";
import "./globals.css";

const display = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Dip Bilet — İstanbul çıkışlı dip uçuş fırsatları",
  description:
    "Kalkışın İstanbul. Biz arka planda tararız; ortalamanın altındaki biletleri sana getiririz.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full antialiased">
        <BackgroundMotifs />
        {children}
      </body>
    </html>
  );
}
