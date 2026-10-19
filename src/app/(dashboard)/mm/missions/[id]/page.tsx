import type { Metadata } from "next";
import { MissionPlanner } from "@/components/mm/MissionPlanner";

export const metadata: Metadata = { title: "Mission" };

export default async function MissionPage({ params }: PageProps<"/mm/missions/[id]">) {
  const { id } = await params;
  return <MissionPlanner missionId={id} />;
}
