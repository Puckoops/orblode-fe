import type { Metadata } from "next";
import { ViewerScreen } from "@/components/viewer/ViewerScreen";

export const metadata: Metadata = { title: "Viewer" };

export default async function ViewerPage({ params }: PageProps<"/viewer/[surveyId]">) {
  const { surveyId } = await params;
  return <ViewerScreen surveyId={surveyId} />;
}
