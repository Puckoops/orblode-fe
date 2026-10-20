import { redirect } from "next/navigation";

export default function RegistersPage() {
  redirect("/settings?tab=teams");
}
