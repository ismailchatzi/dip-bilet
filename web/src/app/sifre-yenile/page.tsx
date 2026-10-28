import type { Metadata } from "next";
import { AuthSplit } from "@/components/AuthSplit";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Yeni şifre — Dip Bilet",
};

export default function SifreYenilePage() {
  return (
    <AuthSplit title="Yeni şifreni belirle.">
      <ResetPasswordForm />
    </AuthSplit>
  );
}
