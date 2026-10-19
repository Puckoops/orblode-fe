import type { Metadata } from "next";
import { MMReportScreen } from "@/components/mm/MMReportScreen";

export const metadata: Metadata = { title: "Report" };

export default async function StudyPage({ params }: PageProps<"/mm/reports/[id]">) {
  const { id } = await params;
  return <MMReportScreen reportId={id} />;
}
