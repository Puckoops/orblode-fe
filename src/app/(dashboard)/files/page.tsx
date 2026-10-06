import type { Metadata } from "next";
import { FilesScreen } from "@/components/files/FilesScreen";

export const metadata: Metadata = { title: "Outputs" };

export default function FilesPage() {
  return <FilesScreen />;
}
