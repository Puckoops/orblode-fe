import type { Metadata } from "next";
import { MissionsScreen } from "@/components/mm/MissionsScreen";

export const metadata: Metadata = { title: "Missions" };

export default function MissionsPage() {
  return <MissionsScreen />;
}
