import type { Metadata } from "next";
import { GlobeScreen } from "@/components/dashboard/GlobeScreen";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return <GlobeScreen />;
}
