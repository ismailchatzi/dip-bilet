import { redirect } from "next/navigation";

/** Eski /panel → ana sayfa (hesap menüsü profil ikonunda) */
export default function PanelRedirect() {
  redirect("/");
}
