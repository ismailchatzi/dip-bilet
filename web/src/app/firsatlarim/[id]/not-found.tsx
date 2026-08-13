import { AccountShell } from "@/components/account/AccountShell";
import Link from "next/link";

export default function DealNotFound() {
  return (
    <AccountShell title="Fırsat bulunamadı" wide>
      <div className="empty">
        Bu fırsat vitrinde yok veya tarihi geçti.{" "}
        <Link href="/firsatlarim">Vitrine dön</Link>
      </div>
    </AccountShell>
  );
}
