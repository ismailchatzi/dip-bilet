import type { Metadata } from "next";
import { LegalShell } from "@/components/LegalShell";

export const metadata: Metadata = {
  title: "İletişim — Dip Bilet",
};

export default function IletisimPage() {
  return (
    <LegalShell title="İletişim">
      <p>
        Sorularınız, KVKK talepleriniz ve üyelik destekleri için bize yazın.
      </p>
      <ul>
        <li>
          E-posta:{" "}
          <a href="mailto:info@dipbilet.com">info@dipbilet.com</a>
        </li>
        <li>Web: dipbilet.com</li>
      </ul>
    </LegalShell>
  );
}
