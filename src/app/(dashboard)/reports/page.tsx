import type { Metadata } from "next";
import { ReportsScreen } from "@/components/reports/ReportsScreen";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return <ReportsScreen />;
}
