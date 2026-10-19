"use client";

import { Add01Icon } from "@hugeicons/core-free-icons";
import { Band, Button, Chip, Page, PageHeader, Skeleton, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getOverview, type Overview } from "@/lib/api/mm";
import { dateTimeOf, thousands } from "@/lib/mm/format";
import { Figure, Figures, MMGate } from "./common";

const FLOW = [
  { key: "application", step: "1", label: "Lease application", href: "/mm/leases" },
  { key: "dgps", step: "2", label: "DGPS control", href: "/mm/dgps" },
  { key: "drone", step: "3", label: "Drone survey", href: "/mm/missions" },
  { key: "analysis", step: "4", label: "Replenishment analysis", href: "/mm/leases" },
  { key: "report", step: "5", label: "Report and vetting", href: "/mm/reports" },
  { key: "vetted", step: "6", label: "Vetted", href: "/mm/reports" },
];

const TONE = { info: "blue", warn: "amber", bad: "red" } as const;

function Content() {
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => {
    getOverview()
      .then(setO)
      .catch((err) => console.error("Failed to fetch the overview:", err));
  }, []);

  return (
    <Page>
      <PageHeader
        eyebrow="Minor minerals"
        title="Overview"
        subtitle="River-sand leases from application to a vetted replenishment study"
        actions={
          <Button variant="primary" iconStart={Add01Icon} asChild>
            <Link href="/mm/leases/new">New application</Link>
          </Button>
        }
      />
      {!o ? (
        <Skeleton height={320} />
      ) : (
        <>
          <Figures>
            <Figure label="Leases" value={o.leases} note={`${o.sites} site${o.sites === 1 ? "" : "s"}`} />
            <Figure label="DGPS jobs" value={o.gnss_jobs} note={`${o.gnss_running} running · ${o.gnss_float} with a float point`} />
            <Figure label="Missions" value={o.missions} note={`${o.missions_open} with vendors`} />
            <Figure label="Reports vetted" value={`${o.reports_vetted} / ${o.reports}`} note={`${o.reports_in_review} with officials`} />
            <Figure label="Replenishment vetted" value={`${thousands(o.replenished_m3)} m³`} note="this season's vetted studies" />
          </Figures>

          <Band heading="Workflow" caption="Where the leases stand. Each opens its screen.">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] overflow-hidden rounded-md border border-hairline">
              {FLOW.map((f) => (
                <Link key={f.key} href={f.href} className="flex flex-col gap-1 border-r border-hairline bg-surface px-4 py-3 last:border-r-0 hover:bg-surface-2">
                  <span className="caption uppercase tracking-wide text-ink-4">Step {f.step}</span>
                  <span className="small font-medium text-ink-1">{f.label}</span>
                  <span className="caption text-ink-4">{o.stages[f.key] ?? 0} lease(s) here</span>
                </Link>
              ))}
            </div>
          </Band>

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Band heading="Needs your attention">
              <Table minWidth={520} isEmpty={o.attention.length === 0} empty="Nothing waits on you.">
                <THead>
                  <Tr>
                    <Th>Lease</Th>
                    <Th>Item</Th>
                    <Th>Status</Th>
                  </Tr>
                </THead>
                <TBody>
                  {o.attention.map((a, i) => (
                    <Tr key={i}>
                      <Td primary>{a.lease_name}</Td>
                      <Td>
                        <Link href={a.link} className="underline-offset-2 hover:underline">
                          {a.item}
                        </Link>
                      </Td>
                      <Td>
                        <Chip tone={TONE[a.tone]} glyph={a.tone === "bad" ? "cross" : a.tone === "warn" ? "triangle" : "circle-half"}>
                          {a.label}
                        </Chip>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Band>
            <Band heading="Recent activity">
              {o.activity.length === 0 ? (
                <p className="small text-ink-4">Nothing yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-hairline">
                  {o.activity.map((a, i) => (
                    <li key={i} className="flex gap-3 py-2">
                      <time className="caption w-24 shrink-0 text-ink-4">{dateTimeOf(a.at)}</time>
                      {a.link ? (
                        <Link href={a.link} className="small text-ink-2 hover:underline">
                          {a.text}
                        </Link>
                      ) : (
                        <span className="small text-ink-2">{a.text}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Band>
          </div>
        </>
      )}
    </Page>
  );
}

export function OverviewScreen() {
  return (
    <MMGate>
      <Content />
    </MMGate>
  );
}
