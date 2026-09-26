import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { AuthSplit } from "@/components/AuthSplit";

export const metadata: Metadata = {
  title: "Giriş Yap — Dip Bilet",
};

export default function GirisPage() {
  return (
    <AuthSplit title="Tekrar hoş geldin.">
      <Suspense fallback={<div className="auth-card">Yükleniyor...</div>}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthSplit>
  );
}
