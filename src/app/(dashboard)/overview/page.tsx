import type { Metadata } from "next";
import { OverviewScreen } from "@/components/overview/OverviewScreen";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return <OverviewScreen />;
}
