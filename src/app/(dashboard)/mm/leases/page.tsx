import type { Metadata } from "next";
import { LeasesScreen } from "@/components/mm/LeasesScreen";

export const metadata: Metadata = { title: "Leases" };

export default function LeasesPage() {
  return <LeasesScreen />;
}
