import { redirect } from "next/navigation";

/** Eski /panel → fırsatlar sayfası */
export default function PanelRedirect() {
  redirect("/firsatlarim");
}
