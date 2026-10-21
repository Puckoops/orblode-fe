"use client";

import { Add01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import {
  Alert,
  Band,
  Button,
  DescriptionList,
  Dialog,
  Field,
  HelperText,
  Input,
  Page,
  PageHeader,
  Select,
  Skeleton,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@puckoops/camelot";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SiteAccess } from "@/components/access/SiteAccess";
import { refusalMessage } from "@/lib/api/client";
import {
  acceptAnalysis,
  sendForVetting,
  siteReviewers,
  createAnalysis,
  createMission,
  getLease,
  getSettings,
  listAnalyses,
  listMasks,
  listMissions,
  listSurveyTags,
  registerLease,
  submitLease,
  tagSurvey,
  updateLease,
  type Analysis,
  type LeaseDetail,
  type LeaseInput,
  type Mask,
  type Mission,
  type Season,
  type SurveyTag,
} from "@/lib/api/mm";
import { listSurveys, type Survey } from "@/lib/api/orblodeSvc";
import { useMay } from "@/lib/access/sitePermissions";
import { dateOf, ha, MINERALS, WORKFLOWS } from "@/lib/mm/format";
import { toast } from "@/lib/toast";
import { useWorkspaceSites } from "@/lib/workspaces/store";
import { AnalysisSummary, StudyProgress, studyRunning } from "./AnalysisSummary";
import { BoundaryUpload } from "./BoundaryUpload";
import { LEASE_STATUS, MISSION_STATUS, MMGate, StatusChip, useFollowSite, useSitePermissionsLoad, VERDICT } from "./common";
import { Documents } from "./Documents";
import { SendForVettingDialog } from "./SendForVettingDialog";
import { StudyInputs } from "./StudyInputs";
import { LazyMap } from "./LazyMap";
import { LeaseForm, leaseInput } from "./LeaseForm";

function AnalysisDialog({
  lease,
  surveys,
  tags,
  masks,
  onClose,
  onDone,
}: {
  lease: LeaseDetail;
  surveys: Survey[];
  tags: SurveyTag[];
  masks: Mask[];
  onClose: () => void;
  onDone: (a: Analysis) => void;
}) {
  const seasonOf = (id: string) => tags.find((t) => t.survey_id === id)?.season;
  const pickDefault = (s: Season) => surveys.find((x) => seasonOf(x.id) === s)?.id ?? "";
  const [pre, setPre] = useState(pickDefault("pre") || surveys[surveys.length - 1]?.id || "");
  const [post, setPost] = useState(pickDefault("post") || surveys[0]?.id || "");
  const [maskIds, setMaskIds] = useState<string[]>(masks.filter((m) => m.kind !== "exclusion").map((m) => m.id));
  const [proposed, setProposed] = useState(lease.study?.proposed_m3 != null ? String(lease.study.proposed_m3) : "");
  const [waterTable, setWaterTable] = useState(lease.study?.water_table_depth_m != null ? String(lease.study.water_table_depth_m) : "");
  const [empirical, setEmpirical] = useState("");
  const [note, setNote] = useState("");
  const [spacing, setSpacing] = useState("50");
  const [accuracy, setAccuracy] = useState("4");
  const [maxExtraction, setMaxExtraction] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getSettings()
      .then(({ study_defaults: d }) => {
        if (!live) return;
        setSpacing((v) => (v === "50" ? String(d.spacing_m) : v));
        setAccuracy((v) => (v === "4" ? String(+(d.vertical_accuracy_m * 100).toFixed(2)) : v));
        setMaxExtraction(d.max_extraction_pct);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const options = surveys.map((s) => ({ value: s.id, label: `${s.survey_date}${seasonOf(s.id) ? ` · ${seasonOf(s.id) === "pre" ? "pre-monsoon" : "post-monsoon"}` : ""}` }));

  const run = async () => {
    if (!pre || !post || pre === post) {
      setError("Choose two different surveys.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const a = await createAnalysis({
        lease_id: lease.id,
        pre_survey_id: pre,
        post_survey_id: post,
        mask_ids: maskIds,
        proposed_m3: Number(proposed) || 0,
        water_table_depth_m: waterTable ? Number(waterTable) : undefined,
        empirical_m3: empirical ? Number(empirical) : undefined,
        empirical_note: note || undefined,
        spacing_m: Number(spacing) || 50,
        vertical_accuracy_m: (Number(accuracy) || 4) / 100,
        max_extraction_pct: maxExtraction,
      });
      toast.success("Measuring the replenishment: you’ll get a notice when it’s done.");
      onDone(a);
      onClose();
    } catch (err) {
      setError(refusalMessage(err, "Couldn't measure the replenishment. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Measure replenishment"
      description="Post minus pre inside the lease and outside the masks, checked by cross-section end areas, then tested against the extraction rules."
      width={640}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void run()}>
            Measure
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Pre-monsoon survey">
          <Select value={pre} onValueChange={setPre} options={options} placeholder="Choose" />
        </Field>
        <Field label="Post-monsoon survey">
          <Select value={post} onValueChange={setPost} options={options} placeholder="Choose" />
        </Field>
        <Field label="Proposed extraction (m³ a year)">
          <Input type="number" min="0" value={proposed} onChange={(e) => setProposed(e.target.value)} placeholder="30000" />
        </Field>
        <Field label="Water table depth (m)" hint="Caps the depth one metre above it">
          <Input type="number" min="0" step="0.1" value={waterTable} onChange={(e) => setWaterTable(e.target.value)} placeholder="optional" />
        </Field>
        <Field label="Section spacing (m)">
          <Input type="number" min="5" value={spacing} onChange={(e) => setSpacing(e.target.value)} />
        </Field>
        <Field label="Vertical accuracy (cm)" hint="From the check points">
          <Input type="number" min="0" step="0.1" value={accuracy} onChange={(e) => setAccuracy(e.target.value)} />
        </Field>
        <Field label="Empirical bed-load estimate (m³)">
          <Input type="number" min="0" value={empirical} onChange={(e) => setEmpirical(e.target.value)} placeholder="optional" />
        </Field>
        <Field label="How it was estimated">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="2026 flood, gauge discharge" />
        </Field>
        <fieldset className="col-span-2 flex flex-col gap-2">
          <legend className="small mb-1 font-medium text-ink-1">Masks to leave out</legend>
          {masks.length === 0 ? (
            <HelperText>No masks yet. Draw water and bank strips in the viewer’s Replenishment panel.</HelperText>
          ) : (
            masks.map((m) => (
              <label key={m.id} className="small flex items-center gap-2">
                <input type="checkbox" checked={maskIds.includes(m.id)} onChange={(e) => setMaskIds((ids) => (e.target.checked ? [...ids, m.id] : ids.filter((i) => i !== m.id)))} />
                {m.name || m.kind.replace("_", " ")} · {ha(m.area_m2)}
              </label>
            ))
          )}
        </fieldset>
      </div>
      {error && (
        <HelperText tone="error" role="alert" className="mt-3">
          {error}
        </HelperText>
      )}
    </Dialog>
  );
}

const LEASE_TABS = ["lease", "documents", "studies", "missions", "access"];

function Content({ leaseId }: { leaseId: string }) {
  const [vetting, setVetting] = useState<Analysis | null>(null);
  const router = useRouter();
  const sites = useWorkspaceSites();
  const [lease, setLease] = useState<LeaseDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [tags, setTags] = useState<SurveyTag[]>([]);
  const [masks, setMasks] = useState<Mask[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const asked = useSearchParams().get("tab");
  const tab = LEASE_TABS.find((t) => t === asked) ?? "lease";
  // The URL is the only record of the tab, so a notice's ?tab=studies link switches it from this page too.
  const choose = (next: string) => {
    const url = new URL(window.location.href);
    if (next === "lease") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url.pathname + url.search);
  };
  const [missions, setMissions] = useState<Mission[]>([]);
  const [editing, setEditing] = useState<LeaseInput | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [busy, setBusy] = useState(false);
  useSitePermissionsLoad(lease?.project_id);
  useFollowSite(lease?.project_id);
  const canUpload = useMay(lease?.project_id, "can_upload");
  const canApprove = useMay(lease?.project_id, "can_approve");
  const canRun = useMay(lease?.project_id, "can_run_analysis");

  const load = useCallback(
    () =>
      getLease(leaseId)
        .then((l) => {
          setLease(l);
          return Promise.all([
            listSurveys(l.project_id).then((r) => setSurveys(r.surveys.slice().sort((x, y) => y.survey_date.localeCompare(x.survey_date)))),
            listSurveyTags(l.project_id).then(setTags),
            listMasks(l.project_id)
              .catch(() => [] as Mask[])
              .then(setMasks),
            listAnalyses(l.id).then(setAnalyses),
            listMissions({ projectId: l.project_id, leaseId: l.id }).then(setMissions),
          ]);
        })
        .catch((err) => {
          console.error("Failed to fetch the lease:", err);
          setFailed(true);
        }),
    [leaseId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const running = analyses.some(studyRunning);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => {
      listAnalyses(leaseId)
        .then(setAnalyses)
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(t);
  }, [running, leaseId]);

  const areas = useMemo(
    () => [
      ...(lease?.boundary_geometry ? [{ id: "lease", kind: "lease" as const, geometry: lease.boundary_geometry }] : []),
      ...masks.map((m) => ({ id: m.id, kind: "mask" as const, geometry: m.geometry, label: m.name })),
    ],
    [lease, masks]
  );

  if (failed) return <Alert tone="critical" title="This lease couldn't load.">It may belong to a project you can’t see.</Alert>;
  if (!lease) return <Skeleton height={400} />;
  const site = sites.find((s) => s.id === lease.project_id);
  const editable = lease.status !== "registered";

  const act = async (fn: () => Promise<LeaseDetail>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      await load();
    } catch (err) {
      toast.error(refusalMessage(err, "That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const setSeason = async (surveyId: string, season: Season | "") => {
    if (!season) return;
    try {
      await tagSurvey(surveyId, season, "");
      setTags(await listSurveyTags(lease.project_id));
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't set the season."));
    }
  };

  const accept = async (a: Analysis) => {
    try {
      const r = await acceptAnalysis(a.id);
      toast.success(`Report version ${r.version} drafted.`);
      router.push(`/mm/reports/${r.id}`);
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't accept the analysis."));
    }
  };

  const newMission = async (season: Season) => {
    try {
      const baseline = season === "post" ? missions.find((m) => m.season === "pre") : undefined;
      const m = await createMission({ lease_id: lease.id, season, baseline_id: baseline?.id });
      router.push(`/mm/missions/${m.id}`);
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't draft the mission."));
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Minor minerals · lease"
        title={lease.name}
        subtitle={[lease.river && `${lease.river} river`, lease.district, lease.tahasil && `${lease.tahasil} tahasil`, site?.name].filter(Boolean).join(" · ")}
        back={<Link href={`/projects?site=${encodeURIComponent(lease.project_id)}`}>← Projects</Link>}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip map={LEASE_STATUS} value={lease.status} />
            {lease.status === "draft" && canUpload && (
              <Button variant="primary" loading={busy} onClick={() => void act(() => submitLease(lease.id), "Application submitted.")}>
                Submit application
              </Button>
            )}
            {lease.status === "submitted" && canApprove && (
              <Button variant="primary" loading={busy} onClick={() => void act(() => registerLease(lease.id), "Lease registered.")}>
                Register lease
              </Button>
            )}
          </div>
        }
      />
      <Tabs value={tab} onValueChange={choose}>
        <TabsList>
          <TabsTrigger value="lease">Lease</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="studies" count={analyses.length}>
            Seasons and studies
          </TabsTrigger>
          <TabsTrigger value="missions" count={missions.length}>
            Missions
          </TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
        </TabsList>

        <TabsContent value="lease" className="flex flex-col gap-6 pt-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <Band
              first
              heading="Details"
              actions={
                editable && canUpload ? (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(leaseInput(lease))}>
                    Edit
                  </Button>
                ) : undefined
              }
            >
              <DescriptionList
                items={[
                  { label: "Lease number", value: lease.lease_no || "–" },
                  { label: "Letter of Intent", value: lease.loi_no || "–" },
                  { label: "Lessee", value: lease.lessee || "–" },
                  { label: "Mineral", value: MINERALS[lease.mineral] ?? lease.mineral },
                  { label: "Workflow", value: WORKFLOWS[lease.workflow] },
                  { label: "Declared area", value: `${lease.declared_area_ha.toFixed(2)} ha` },
                  {
                    label: "Boundary",
                    value: lease.boundary
                      ? `${ha(lease.boundary.area_m2)} · ${lease.boundary.pillar_count} pillars (${lease.boundary.area_diff_pct >= 0 ? "+" : ""}${lease.boundary.area_diff_pct.toFixed(2)} %)`
                      : "Not set",
                  },
                  { label: "Permitted depth", value: `${lease.permitted_depth_m.toFixed(1)} m` },
                  { label: "Validity", value: [lease.valid_from, lease.valid_to].filter(Boolean).join(" to ") || "–" },
                  { label: "Submitted", value: dateOf(lease.submitted_at) },
                  { label: "Registered", value: dateOf(lease.registered_at) },
                ]}
              />
            </Band>
            <Band first heading="Boundary" caption={lease.boundary ? lease.boundary.source_name : "Upload the lease boundary to draw it here."}>
              {areas.length > 0 ? <LazyMap areas={areas} height={380} /> : <Skeleton height={380} />}
            </Band>
          </div>
          {editable && canUpload && (
            <Band heading={lease.boundary ? "Replace the boundary" : "Set the boundary"}>
              <BoundaryUpload lease={lease} onSaved={() => void load()} />
            </Band>
          )}
        </TabsContent>

        <TabsContent value="documents" className="pt-6">
          <Documents lease={lease} editable={canUpload} onChange={() => void load()} />
        </TabsContent>

        <TabsContent value="studies" className="flex flex-col gap-6 pt-6">
          <Band heading="Surveys of the project" caption="Mark which survey is the pre-monsoon and which the post-monsoon one.">
            <Table minWidth={520} isEmpty={surveys.length === 0} empty="The project has no surveys yet.">
              <THead>
                <Tr>
                  <Th>Survey date</Th>
                  <Th>Season</Th>
                  <Th>
                    <span className="visually-hidden">Open</span>
                  </Th>
                </Tr>
              </THead>
              <TBody>
                {surveys.map((s) => (
                  <Tr key={s.id}>
                    <Td primary>{s.survey_date}</Td>
                    <Td>
                      <Select
                        aria-label={`Season of ${s.survey_date}`}
                        value={tags.find((t) => t.survey_id === s.id)?.season ?? ""}
                        onValueChange={(v) => void setSeason(s.id, v as Season)}
                        allLabel="Not set"
                        options={[
                          { value: "pre", label: "Pre-monsoon" },
                          { value: "post", label: "Post-monsoon" },
                        ]}
                        disabled={!canUpload}
                      />
                    </Td>
                    <Td className="text-right">
                      <Button variant="quiet" size="sm" iconStart={ViewIcon} asChild>
                        <Link href={`/viewer/${s.id}?module=replenishment`}>Viewer</Link>
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Band>
          <Band heading="Study inputs" caption="What this lease's studies measure against.">
            <StudyInputs key={lease.id} lease={lease} editable={canRun} onSaved={(l) => setLease({ ...lease, study: l.study })} />
          </Band>
          <Band
            heading="Replenishment studies"
            caption="Each measures one pair of surveys. Accept one to draft the lease's report."
            actions={
              <Button variant="ghost" iconStart={Add01Icon} disabled={!lease.boundary || surveys.length < 2} onClick={() => setMeasuring(true)}>
                Measure replenishment
              </Button>
            }
          >
            {analyses.length === 0 ? (
              <HelperText>No study yet{!lease.boundary ? ": set the boundary first" : surveys.length < 2 ? ": the project needs two surveys" : ""}.</HelperText>
            ) : (
              <div className="flex flex-col gap-6">
                {analyses.map((a) => (
                  <div key={a.id} className="flex flex-col gap-3 rounded-md border border-hairline p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="small text-ink-2">
                        {surveys.find((s) => s.id === a.pre_survey_id)?.survey_date ?? "pre"} → {surveys.find((s) => s.id === a.post_survey_id)?.survey_date ?? "post"} ·{" "}
                        {a.status === "draft" || a.status === "accepted" ? (
                          <>
                            measured {dateOf(a.progress?.finished_at || a.created_at)} · <StatusChip map={VERDICT} value={a.verdict} />
                          </>
                        ) : (
                          `started ${dateOf(a.created_at)}`
                        )}
                      </span>
                      {studyRunning(a) || a.status === "failed" ? null : a.status === "accepted" ? (
                        a.report_id && (
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/mm/reports/${a.report_id}`}>Open report</Link>
                          </Button>
                        )
                      ) : (
                        <div className="flex gap-2">
                          <Button variant="quiet" size="sm" onClick={() => void accept(a)}>
                            Draft only
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => setVetting(a)}>
                            Send for vetting
                          </Button>
                        </div>
                      )}
                    </div>
                    {a.status === "draft" || a.status === "accepted" ? <AnalysisSummary a={a} /> : <StudyProgress a={a} />}
                  </div>
                ))}
              </div>
            )}
          </Band>
        </TabsContent>

        {vetting && (
          <SendForVettingDialog
            reviewers={() => siteReviewers(lease.project_id)}
            send={(steps) => sendForVetting(vetting.id, steps)}
            onClose={() => setVetting(null)}
            onDone={(r) => router.push(`/mm/reports/${r.id}`)}
          />
        )}
        <TabsContent value="missions" className="pt-6">
          <Band
            heading="Missions"
            actions={
              lease.boundary ? (
                <div className="flex gap-2">
                  <Button variant="ghost" iconStart={Add01Icon} onClick={() => void newMission("pre")}>
                    Pre-monsoon mission
                  </Button>
                  <Button variant="ghost" iconStart={Add01Icon} onClick={() => void newMission("post")}>
                    Post-monsoon mission
                  </Button>
                </div>
              ) : undefined
            }
          >
            <Table minWidth={520} isEmpty={missions.length === 0} empty="No missions yet.">
              <THead>
                <Tr>
                  <Th>Mission</Th>
                  <Th>Season</Th>
                  <Th>Window</Th>
                  <Th>Status</Th>
                </Tr>
              </THead>
              <TBody>
                {missions.map((m) => (
                  <Tr key={m.id}>
                    <Td primary>
                      <Link href={`/mm/missions/${m.id}`} className="hover:underline">
                        {m.code}
                      </Link>
                    </Td>
                    <Td>{m.season === "post" ? "Post-monsoon" : "Pre-monsoon"}</Td>
                    <Td>{m.window || m.flight_from || "–"}</Td>
                    <Td>
                      <StatusChip map={MISSION_STATUS} value={m.status} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Band>
        </TabsContent>

        <TabsContent value="access" className="pt-6">
          {site ? <SiteAccess site={site} /> : <HelperText>This project is in another workspace: switch to it to see who has access.</HelperText>}
          <HelperText className="mt-3">
            Give officials a custom role that can vet, and vendors one that uploads mission data. Make the roles in <Link href="/settings?tab=roles">Settings → Roles</Link>.
          </HelperText>
        </TabsContent>
      </Tabs>

      {editing && (
        <Dialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          title={`Edit ${lease.name}`}
          width={760}
          footer={
            <>
              <Button variant="quiet" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={() =>
                  void act(async () => {
                    const l = await updateLease(lease.id, editing);
                    setEditing(null);
                    return l;
                  }, "Lease saved.")
                }
              >
                Save
              </Button>
            </>
          }
        >
          <LeaseForm value={editing} onChange={setEditing} siteLocked />
        </Dialog>
      )}
      {measuring && <AnalysisDialog lease={lease} surveys={surveys} tags={tags} masks={masks} onClose={() => setMeasuring(false)} onDone={(a) => setAnalyses((list) => [a, ...list])} />}
    </Page>
  );
}

export function LeaseScreen({ leaseId }: { leaseId: string }) {
  return (
    <MMGate anyWorkspace>
      <Content leaseId={leaseId} />
    </MMGate>
  );
}
