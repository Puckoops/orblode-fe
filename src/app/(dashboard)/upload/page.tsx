import type { Metadata } from "next";
import { UploadScreen } from "@/components/upload/UploadScreen";

export const metadata: Metadata = { title: "Create" };

export default function UploadPage() {
  return <UploadScreen />;
}
