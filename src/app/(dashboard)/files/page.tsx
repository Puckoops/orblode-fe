import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader } from "@/components/brand/Loader";
import { FilesScreen } from "@/components/files/FilesScreen";

export const metadata: Metadata = { title: "Outputs" };

export default function FilesPage() {
  return (
    <Suspense fallback={<Loader label="Loading files" />}>
      <FilesScreen />
    </Suspense>
  );
}
