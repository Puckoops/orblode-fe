import type { Metadata } from "next";
import { SharedReport } from "@/components/mm/SharedReport";

export const metadata: Metadata = { title: "Shared report", robots: { index: false, follow: false } };

export default async function SharedReportPage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  return <SharedReport token={token} />;
}
