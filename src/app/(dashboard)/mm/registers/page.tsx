import type { Metadata } from "next";
import { RegistersScreen } from "@/components/mm/RegistersScreen";

export const metadata: Metadata = { title: "Registers" };

export default function RegistersPage() {
  return <RegistersScreen />;
}
