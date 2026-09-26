import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { AuthSplit } from "@/components/AuthSplit";

export const metadata: Metadata = {
  title: "Ücretsiz Üye Ol — Dip Bilet",
  description:
    "Dip Bilet Kulübü’ne katıl, dip fırsatlardan anında haberin olsun.",
};

export default function UyeOlPage() {
  return (
    <AuthSplit title="Kulübe katıl.">
      <Suspense fallback={<div className="auth-card">Yükleniyor...</div>}>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthSplit>
  );
}
