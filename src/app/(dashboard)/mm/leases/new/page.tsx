import type { Metadata } from "next";
import { LeaseWizard } from "@/components/mm/LeaseWizard";

export const metadata: Metadata = { title: "New application" };

export default function NewLeasePage() {
  return <LeaseWizard />;
}
