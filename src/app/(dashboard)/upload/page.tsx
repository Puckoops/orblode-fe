import type { Metadata } from "next";
import { CreateScreen } from "@/components/upload/CreateScreen";

export const metadata: Metadata = { title: "Create" };

export default function UploadPage() {
  return <CreateScreen />;
}
