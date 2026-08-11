import { redirect } from "next/navigation";

/** Eski /panel → ana sayfada hesap menüsü (fırsatlar) */
export default function PanelRedirect() {
  redirect("/?hesap=firsatlar");
}
