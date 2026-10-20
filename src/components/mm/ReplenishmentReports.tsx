"use client";

import { Download01Icon } from "@hugeicons/core-free-icons";
import { Band, Button, Chip, Select, Skeleton, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useState } from "react";
import { listReports, sharingLog, summaryCsvUrl, type Report, type ReportStatus, type Share, type ShareAccess } from "@/lib/api/mm";
import { dateOf, dateTimeOf, m3 } from "@/lib/mm/format";
import { MMGate, REPORT_STATUS, StatusChip, VERDICT } from "./common";

type LogRow = { share: Share; open: boolean; accesses: ShareAccess[] };

/** Downloads every vetted study's figures as a spreadsheet. */
export function SummaryCsvButton() {
  return (
    <Button variant="ghost" iconStart={Download01Icon} asChild>
      <a href={summaryCsvUrl()} download="replenishment_summary.csv">
        Summary CSV
      </a>
    </Button>
  );
}

function WaitingForYou() {
  const [reports, setReports] = useState<Report[] | null>(null);
  useEffect(() => {
    listReports({ waiting: true })
      .then(setReports)
      .catch(() => setReports([]));
  }, []);
  if (!reports) return <Skeleton height={96} />;
  return (
    <Table minWidth={640} isEmpty={reports.length === 0} empty="Nothing waits on you.">
      <THead>
        <Tr>
          <Th>Report</Th>
          <Th>Your step</Th>
          <Th numeric>Replenished</Th>
          <Th>Submitted</Th>
        </Tr>
      </THead>
      <TBody>
        {reports.map((r) => (
          <Tr key={r.id}>
            <Td primary>
              <Link href={`/mm/reports/${r.id}`} className="hover:underline">
                {r.title}
              </Link>
              <span className="caption block text-ink-4">{[r.lease.river, r.lease.district].filter(Boolean).join(" · ")}</span>
            </Td>
            <Td>
              {r.chain[r.current_step]?.label ?? "–"}
              <span className="caption block text-ink-4">
                Step {r.current_step + 1} of {r.chain.length}
              </span>
            </Td>
            <Td numeric>{m3(r.analysis.results.adopted_m3)}</Td>
            <Td>{dateOf(r.submitted_at)}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

function Content() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [status, setStatus] = useState<ReportStatus | "">("");
  const [log, setLog] = useState<LogRow[]>([]);

  useEffect(() => {
    listReports({ status: status || undefined })
      .then(setReports)
      .catch((err) => {
        console.error("Failed to fetch reports:", err);
        setReports([]);
      });
  }, [status]);

  useEffect(() => {
    sharingLog()
      .then((rows) => setLog(rows ?? []))
      .catch(() => setLog([]));
  }, []);

  const titleOf = (reportId: string) => reports?.find((r) => r.id === reportId)?.title ?? "Report";

  return (
    <>
      <Band first heading="Waiting for you" caption="Reports at a review step you decide.">
        <WaitingForYou />
      </Band>
      <Band
        heading="All reports"
        actions={
          <Select
            aria-label="Status"
            value={status}
            onValueChange={(v) => {
              setReports(null);
              setStatus(v as ReportStatus | "");
            }}
            allLabel="Every status"
            options={Object.entries(REPORT_STATUS).map(([value, p]) => ({ value, label: p.label }))}
          />
        }
      >
        {!reports ? (
          <Skeleton height={200} />
        ) : (
          <Table minWidth={860} isEmpty={reports.length === 0} empty="No reports yet: accept a replenishment study on a lease to draft one.">
            <THead>
              <Tr>
                <Th>Report</Th>
                <Th numeric>Version</Th>
                <Th numeric>Replenished</Th>
                <Th>Verdict</Th>
                <Th>Submitted</Th>
                <Th>Vetted</Th>
                <Th>Status</Th>
              </Tr>
            </THead>
            <TBody>
              {reports.map((r) => (
                <Tr key={r.id}>
                  <Td primary>
                    <Link href={`/mm/reports/${r.id}`} className="hover:underline">
                      {r.title}
                    </Link>
                    <span className="caption block text-ink-4">{[r.lease.river, r.lease.district].filter(Boolean).join(" · ")}</span>
                  </Td>
                  <Td numeric>v{r.version}</Td>
                  <Td numeric>{m3(r.analysis.results.adopted_m3)}</Td>
                  <Td>
                    <StatusChip map={VERDICT} value={r.analysis.verdict} />
                  </Td>
                  <Td>{dateOf(r.submitted_at)}</Td>
                  <Td>{dateOf(r.vetted_at)}</Td>
                  <Td>
                    <StatusChip map={REPORT_STATUS} value={r.status} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Band>
      <Band heading="Sharing log" caption="Every link handed out, and every time it was opened.">
        <Table minWidth={860} isEmpty={log.length === 0} empty="No report has been shared yet.">
          <THead>
            <Tr>
              <Th>Recipient</Th>
              <Th>Report</Th>
              <Th>Access</Th>
              <Th numeric>Views</Th>
              <Th numeric>Downloads</Th>
              <Th>Last opened</Th>
              <Th>Link</Th>
            </Tr>
          </THead>
          <TBody>
            {log.map(({ share, open, accesses }) => (
              <Tr key={share.id}>
                <Td primary>
                  {share.recipient}
                  {share.recipient_email && <span className="caption block text-ink-4">{share.recipient_email}</span>}
                </Td>
                <Td>
                  <Link href={`/mm/reports/${share.report_id}`} className="hover:underline">
                    {titleOf(share.report_id)}
                  </Link>
                </Td>
                <Td>{share.access === "download" ? "View and download" : "View only"}</Td>
                <Td numeric>{share.views}</Td>
                <Td numeric>{share.downloads}</Td>
                <Td>{accesses.length ? dateTimeOf(Math.max(...accesses.map((a) => a.at))) : "Not yet"}</Td>
                <Td>
                  {open ? (
                    <Chip tone="teal" glyph="check">
                      Open{share.expires_at ? ` until ${dateOf(share.expires_at)}` : ""}
                    </Chip>
                  ) : (
                    <Chip tone="neutral" glyph="square">
                      {share.revoked ? "Revoked" : "Expired"}
                    </Chip>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Band>
    </>
  );
}

/** A minor-minerals workspace's replenishment reports: the ones waiting on the caller first, then all of them, then
 * every link they were shared by. */
export function ReplenishmentReports() {
  return (
    <MMGate>
      <Content />
    </MMGate>
  );
}
