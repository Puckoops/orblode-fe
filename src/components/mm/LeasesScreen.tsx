"use client";

import { Add01Icon, Download01Icon } from "@hugeicons/core-free-icons";
import { Band, Button, Page, PageHeader, Skeleton, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getRegister, type RegisterRow } from "@/lib/api/mm";
import { saveFile } from "@/lib/mm/exports";
import { ha } from "@/lib/mm/format";
import { useWorkspaceSites } from "@/lib/workspaces/store";
import { LEASE_STATUS, MMGate, Stages, StatusChip } from "./common";

const STATE_TONE: Record<string, string> = {
  approved: "teal",
  returned: "red",
  with_officials: "amber",
  processing: "blue",
};

function csv(rows: RegisterRow[], siteName: (id: string) => string): string {
  const head = ["Ghat", "Site", "Lease no.", "Tahasil", "Area (ha)", "Application", ...rows[0]?.stages.map((s) => s.label) ?? [], "Status"];
  const body = rows.map((r) => [
    r.lease.name,
    siteName(r.lease.project_id),
    r.lease.lease_no,
    r.lease.tahasil,
    r.lease.declared_area_ha.toFixed(2),
    r.lease.status,
    ...r.stages.map((s) => s.state),
    r.state_label,
  ]);
  return [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, "'")}"`).join(",")).join("\n") + "\n";
}

function Content() {
  const sites = useWorkspaceSites();
  const [rows, setRows] = useState<RegisterRow[] | null>(null);
  useEffect(() => {
    getRegister()
      .then(setRows)
      .catch((err) => {
        console.error("Failed to fetch the register:", err);
        setRows([]);
      });
  }, []);
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? "Another workspace";

  return (
    <Page>
      <PageHeader
        eyebrow="Minor minerals"
        title="Leases"
        subtitle="One row per ghat or lease block. Stages: application, DGPS, drone survey, analysis, report, vetted."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" iconStart={Download01Icon} disabled={!rows?.length} onClick={() => rows && saveFile("project_register.csv", csv(rows, siteName), "text/csv")}>
              Export
            </Button>
            <Button variant="primary" iconStart={Add01Icon} asChild>
              <Link href="/mm/leases/new">New application</Link>
            </Button>
          </div>
        }
      />
      <Band first heading="Project register">
        {!rows ? (
          <Skeleton height={200} />
        ) : (
          <Table minWidth={820} isEmpty={rows.length === 0} empty="No leases yet: start an application.">
            <THead>
              <Tr>
                <Th>Ghat or lease block</Th>
                <Th>Site</Th>
                <Th>Tahasil</Th>
                <Th numeric>Area</Th>
                <Th>Progress</Th>
                <Th>Application</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.lease.id}>
                  <Td primary>
                    <Link href={`/mm/leases/${r.lease.id}`} className="hover:underline">
                      {r.lease.name}
                    </Link>
                    {r.lease.lease_no && <span className="caption block text-ink-4">{r.lease.lease_no}</span>}
                  </Td>
                  <Td>{siteName(r.lease.project_id)}</Td>
                  <Td>{r.lease.tahasil || "–"}</Td>
                  <Td numeric>{r.lease.boundary ? ha(r.lease.boundary.area_m2) : `${r.lease.declared_area_ha.toFixed(2)} ha`}</Td>
                  <Td>
                    <Stages stages={r.stages} />
                  </Td>
                  <Td>
                    <StatusChip map={LEASE_STATUS} value={r.lease.status} />
                  </Td>
                  <Td>
                    <span className={`small ${STATE_TONE[r.state] ? "font-medium text-ink-1" : "text-ink-3"}`}>{r.state_label}</span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Band>
    </Page>
  );
}

export function LeasesScreen() {
  return (
    <MMGate>
      <Content />
    </MMGate>
  );
}
