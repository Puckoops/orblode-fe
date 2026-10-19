import type { Metadata } from "next";
import { DgpsScreen } from "@/components/mm/DgpsScreen";

export const metadata: Metadata = { title: "DGPS" };

export default function DgpsPage() {
  return <DgpsScreen />;
}
