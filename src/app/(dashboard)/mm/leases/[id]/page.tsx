import type { Metadata } from "next";
import { LeaseScreen } from "@/components/mm/LeaseScreen";

export const metadata: Metadata = { title: "Lease" };

export default async function LeasePage({ params }: PageProps<"/mm/leases/[id]">) {
  const { id } = await params;
  return <LeaseScreen leaseId={id} />;
}
