import type { Metadata } from "next";
import { MMReportsScreen } from "@/components/mm/MMReportsScreen";

export const metadata: Metadata = { title: "Studies" };

export default function StudiesPage() {
  return <MMReportsScreen />;
}
