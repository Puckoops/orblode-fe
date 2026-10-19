import type { Metadata } from "next";
import { OverviewScreen } from "@/components/mm/OverviewScreen";

export const metadata: Metadata = { title: "Minor minerals" };

export default function MinorMineralsPage() {
  return <OverviewScreen />;
}
