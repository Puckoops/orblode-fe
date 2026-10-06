import type { Metadata } from "next";
import { GlobeScreen } from "@/components/dashboard/GlobeScreen";

export const metadata: Metadata = { title: "Sites" };

export default function GlobePage() {
  return <GlobeScreen />;
}
