import type { Metadata } from "next";
import { MMHome } from "@/components/mm/MMHome";

export const metadata: Metadata = { title: "Minor minerals" };

export default function MinorMineralsPage() {
  return <MMHome />;
}
