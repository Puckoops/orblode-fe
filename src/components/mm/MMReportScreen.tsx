"use client";

import { Copy01Icon, Download01Icon } from "@hugeicons/core-free-icons";
import {
  Alert,
  Band,
  Button,
  Chip,
  DescriptionList,
  Dialog,
  Field,
  HelperText,
  IconButton,
  Input,
  Page,
  PageHeader,
  Select,
  Skeleton,
  Switch,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TBody,
  Td,
  Textarea,
  Th,
  THead,
  Tr,
} from "@puckoops/camelot";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthUser } from "@/hooks/useAuth";
import { refusalMessage } from "@/lib/api/client";
import {
  createShare,
  decideReport,
  getReport,
  listShares,
  renderReport,
  reportFileLink,
  reportReviewers,
  reviseReport,
  revokeShare,
  submitReport,
  type Report,
  type Share,
  type ShareInput,
} from "@/lib/api/mm";
import { useMay } from "@/lib/access/sitePermissions";
import { bytes, dateOf, dateTimeOf, MINERALS, WORKFLOWS } from "@/lib/mm/format";
import { toast } from "@/lib/toast";
import { AnalysisSummary } from "./AnalysisSummary";
import { MMGate, REPORT_STATUS, StatusChip, useFollowSite, useSitePermissionsLoad } from "./common";
import { SendForVettingDialog } from "./SendForVettingDialog";

function ShareDialog({ report, onClose, onDone }: { report: Report; onClose: () => void; onDone: () => void }) {
  const [input, setInput] = useState<ShareInput>({ recipient: "", recipient_email: "", access: "view", expires_in_days: 30, watermark: true });
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!input.recipient.trim()) {
      setError("Say who the link is for.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await createShare(report.id, { ...input, recipient_email: input.recipient_email || undefined });
      setLink(out.url);
      onDone();
    } catch (err) {
      setError(refusalMessage(err, "Couldn't make the link. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Share the vetted report"
      description="A link that opens without signing in. Every view and download is logged; you can revoke it at any time."
      footer={
        link ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="quiet" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void create()}>
              Make the link
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="flex flex-col gap-3">
          <Alert tone="success" title="Link ready">
            This is the only time the full link is shown. Copy it now.
          </Alert>
          <div className="flex items-center gap-2">
            <Input value={link} readOnly aria-label="Share link" onFocus={(e) => e.target.select()} />
            <IconButton
              icon={Copy01Icon}
              aria-label="Copy the link"
              onClick={() =>
                void navigator.clipboard.writeText(link).then(
                  () => toast.success("Link copied."),
                  () => toast.error("Couldn't copy: select the link and copy it.")
                )
              }
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Recipient" required>
            <Input value={input.recipient} onChange={(e) => setInput({ ...input, recipient: e.target.value })} placeholder="Directorate of Mines" />
          </Field>
          <Field label="Their email" hint="For the log; nothing is sent">
            <Input type="email" value={input.recipient_email} onChange={(e) => setInput({ ...input, recipient_email: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Access">
              <Select
                value={input.access}
                onValueChange={(v) => setInput({ ...input, access: v as ShareInput["access"] })}
                options={[
                  { value: "view", label: "View only" },
                  { value: "download", label: "View and download" },
                ]}
              />
            </Field>
            <Field label="Expires after">
              <Select
                value={String(input.expires_in_days)}
                onValueChange={(v) => setInput({ ...input, expires_in_days: Number(v) })}
                options={[
                  { value: "7", label: "7 days" },
                  { value: "30", label: "30 days" },
                  { value: "90", label: "90 days" },
                  { value: "0", label: "Never" },
                ]}
              />
            </Field>
          </div>
          <Switch checked={input.watermark} onCheckedChange={(watermark) => setInput({ ...input, watermark })} label="Watermark the PDF with the recipient's name" />
        </div>
      )}
      {error && (
        <HelperText tone="error" role="alert" className="mt-3">
          {error}
        </HelperText>
      )}
    </Dialog>
  );
}

function Content({ reportId }: { reportId: string }) {
  const router = useRouter();
  const me = useAuthUser();
  const [report, setReport] = useState<Report | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const projectId = report?.project_id;
  useSitePermissionsLoad(projectId);
  useFollowSite(projectId);
  const canRun = useMay(projectId, "can_run_analysis");
  const canVet = useMay(projectId, "can_vet");
  const canExport = useMay(projectId, "can_export");

  const load = useCallback(
    () =>
      getReport(reportId).then((r) => {
        setReport(r);
        if (r.status === "vetted")
          return listShares(r.id)
            .catch(() => [] as Share[])
            .then(setShares);
      }),
    [reportId]
  );

  useEffect(() => {
    load().catch((err) => {
      console.error("Failed to fetch the report:", err);
      setFailed(true);
    });
  }, [load]);

  const rendering = report?.render.status === "queued" || report?.render.status === "rendering";
  useEffect(() => {
    if (!rendering) return;
    const t = window.setInterval(() => void load().catch(() => undefined), 4000);
    return () => window.clearInterval(t);
  }, [rendering, load]);

  if (failed) return <Alert tone="critical" title="This report couldn't load.">It may belong to a project you can’t see.</Alert>;
  if (!report) return <Skeleton height={400} />;

  const editable = report.status === "draft" || report.status === "returned";
  const step = report.status === "in_review" ? report.chain[report.current_step] : undefined;
  const myTurn = Boolean(step && me && step.reviewer_ids.includes(me.id) && canVet);

  const act = async (key: string, fn: () => Promise<Report>, done: string) => {
    setBusy(key);
    try {
      const r = await fn();
      toast.success(done);
      if (r.id !== report.id) router.push(`/mm/reports/${r.id}`);
      else await load();
    } catch (err) {
      toast.error(refusalMessage(err, "That didn't work. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const open = async (fileId: string) => {
    try {
      window.open((await reportFileLink(report.id, fileId)).url, "_blank", "noopener");
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't open the file."));
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={`Minor minerals · report v${report.version}`}
        title={report.title}
        subtitle={[report.lease.name, report.lease.river && `${report.lease.river} river`, report.lease.district].filter(Boolean).join(" · ")}
        back={<Link href="/reports">← Reports</Link>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip map={REPORT_STATUS} value={report.status} />
            {editable && canRun && (
              <>
                <Button variant="ghost" loading={busy === "render" || rendering} onClick={() => void act("render", () => renderReport(report.id), "Rendering the report.")}>
                  {report.render.status === "ready" ? "Render again" : "Render"}
                </Button>
                <Button variant="primary" onClick={() => setSubmitting(true)}>
                  Send for review
                </Button>
              </>
            )}
            {(report.status === "vetted" || report.status === "returned") && canRun && (
              <Button variant="ghost" loading={busy === "revise"} onClick={() => void act("revise", () => reviseReport(report.id), "Revision drafted.")}>
                Revise
              </Button>
            )}
            {report.status === "vetted" && canExport && (
              <Button variant="primary" onClick={() => setSharing(true)}>
                Share
              </Button>
            )}
          </div>
        }
      />
      {report.status === "superseded" && (
        <Alert tone="info" title="A newer version replaces this one">
          It stays as it was vetted, for the record.
        </Alert>
      )}
      {report.status === "returned" && (
        <Alert tone="warning" title="Returned">
          {[...report.chain].reverse().find((s) => s.decision === "returned")?.comment || "A reviewer returned the report."}
        </Alert>
      )}
      {myTurn && step && (
        <Band first heading={`Your decision: ${step.label}`} caption="Approving the last step vets the rendered PDF; returning sends it back to the planner with your comment.">
          <div className="flex flex-col gap-3">
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (needed to return)" aria-label="Comment" />
            <div className="flex gap-2">
              <Button variant="primary" loading={busy === "approve"} onClick={() => void act("approve", () => decideReport(report.id, "approved", comment), "Approved.")}>
                Approve
              </Button>
              <Button variant="ghost" disabled={!comment.trim()} loading={busy === "return"} onClick={() => void act("return", () => decideReport(report.id, "returned", comment), "Returned to the planner.")}>
                Return
              </Button>
            </div>
          </div>
        </Band>
      )}
      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
          <TabsTrigger value="files" count={report.files.length || undefined}>
            Files
          </TabsTrigger>
          {report.status === "vetted" && (
            <TabsTrigger value="sharing" count={shares.length || undefined}>
              Sharing
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="summary" className="flex flex-col gap-6 pt-6">
          <AnalysisSummary a={report.analysis} />
          <Band heading="Lease">
            <DescriptionList
              items={[
                { label: "Lease number", value: report.lease.lease_no || "–" },
                { label: "Lessee", value: report.lease.lessee || "–" },
                { label: "Mineral", value: MINERALS[report.lease.mineral] ?? report.lease.mineral },
                { label: "Workflow", value: WORKFLOWS[report.lease.workflow] },
                { label: "Tahasil and mouza", value: [report.lease.tahasil, report.lease.mouza].filter(Boolean).join(", ") || "–" },
                { label: "Permitted depth", value: `${report.lease.permitted_depth_m.toFixed(1)} m` },
              ]}
            />
            <Link href={`/mm/leases/${report.lease_id}`} className="small mt-3 inline-block text-accent hover:underline">
              Open the lease
            </Link>
          </Band>
        </TabsContent>
        <TabsContent value="review" className="pt-6">
          {report.chain.length === 0 ? (
            <HelperText>Not sent for review yet.</HelperText>
          ) : (
            <ol className="flex flex-col gap-3">
              {report.chain.map((s, i) => (
                <li key={i} className="flex flex-wrap items-start gap-3 rounded-md border border-hairline p-3">
                  <span className="small min-w-40 font-medium text-ink-1">
                    {i + 1}. {s.label}
                  </span>
                  <span className="caption flex-1 text-ink-3">
                    {s.decided_by ? `${s.decided_by.email} · ${dateTimeOf(s.decided_at)}` : report.status === "in_review" && i === report.current_step ? "Waiting for a decision" : "Not reached"}
                    {s.comment && <span className="mt-1 block text-ink-2">“{s.comment}”</span>}
                  </span>
                  {s.decision === "approved" && (
                    <Chip tone="teal" glyph="check">
                      Approved
                    </Chip>
                  )}
                  {s.decision === "returned" && (
                    <Chip tone="red" glyph="redo">
                      Returned
                    </Chip>
                  )}
                </li>
              ))}
            </ol>
          )}
        </TabsContent>
        <TabsContent value="files" className="flex flex-col gap-3 pt-6">
          {report.render.status === "failed" && (
            <Alert tone="critical" title="Rendering failed">
              {report.render.error}
            </Alert>
          )}
          {rendering && <HelperText>Rendering the PDF, the cross-sections and the tables…</HelperText>}
          <Table minWidth={640} isEmpty={report.files.length === 0} empty="Render the report to make its files.">
            <THead>
              <Tr>
                <Th>File</Th>
                <Th numeric>Size</Th>
                <Th>SHA-256</Th>
                <Th>Made</Th>
                <Th>
                  <span className="visually-hidden">Download</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {report.files.map((f) => (
                <Tr key={f.id}>
                  <Td primary>{f.name}</Td>
                  <Td numeric>{bytes(f.size)}</Td>
                  <Td>
                    <code className="caption text-ink-3" title={f.sha256}>
                      {f.sha256.slice(0, 16)}…
                    </code>
                  </Td>
                  <Td>{dateOf(f.created_at)}</Td>
                  <Td className="text-right">
                    <IconButton icon={Download01Icon} aria-label={`Download ${f.name}`} variant="bare" size="sm" onClick={() => void open(f.id)} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TabsContent>
        {report.status === "vetted" && (
          <TabsContent value="sharing" className="pt-6">
            <Table minWidth={720} isEmpty={shares.length === 0} empty="Not shared yet.">
              <THead>
                <Tr>
                  <Th>Recipient</Th>
                  <Th>Access</Th>
                  <Th numeric>Views</Th>
                  <Th numeric>Downloads</Th>
                  <Th>Expires</Th>
                  <Th>
                    <span className="visually-hidden">Revoke</span>
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {shares.map((s) => (
                  <Tr key={s.id}>
                    <Td primary>
                      {s.recipient}
                      {s.revoked && (
                        <Chip tone="neutral" glyph="square" className="ml-2">
                          Revoked
                        </Chip>
                      )}
                    </Td>
                    <Td>{s.access === "download" ? "View and download" : "View only"}</Td>
                    <Td numeric>{s.views}</Td>
                    <Td numeric>{s.downloads}</Td>
                    <Td>{s.expires_at ? dateOf(s.expires_at) : "Never"}</Td>
                    <Td className="text-right">
                      {!s.revoked && canExport && (
                        <Button
                          size="sm"
                          variant="quiet"
                          onClick={() =>
                            void revokeShare(s.id).then(
                              () => (toast.success("Link revoked."), void load()),
                              (err) => toast.error(refusalMessage(err, "Couldn't revoke the link."))
                            )
                          }
                        >
                          Revoke
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TabsContent>
        )}
      </Tabs>
      {submitting && (
        <SendForVettingDialog
          title="Send for review"
          initialSteps={report.chain.length ? report.chain.map((c) => ({ label: c.label, reviewer_ids: c.reviewer_ids })) : undefined}
          reviewers={() => reportReviewers(report.id)}
          send={(steps) => submitReport(report.id, steps)}
          onClose={() => setSubmitting(false)}
          onDone={setReport}
        />
      )}
      {sharing && <ShareDialog report={report} onClose={() => setSharing(false)} onDone={() => void load()} />}
    </Page>
  );
}

export function MMReportScreen({ reportId }: { reportId: string }) {
  return (
    <MMGate anyWorkspace>
      <Content reportId={reportId} />
    </MMGate>
  );
}
