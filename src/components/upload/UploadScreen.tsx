"use client";

import { Cancel01Icon, File01Icon } from "@hugeicons/core-free-icons";
import {
  Alert,
  Button,
  Card,
  DateInput,
  Dropzone,
  Field,
  FormFooter,
  Glyph,
  Icon,
  IconButton,
  Input,
  Page,
  PageHeader,
  Progress,
  ProgressCircle,
  SearchSelect,
  SegmentedControl,
  Select,
  toast,
} from "@puckoops/camelot";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StateChip } from "@/components/common/StateChip";
import { TagInput } from "@/components/common/TagInput";
import { PushOffer } from "@/components/notifications/PushOffer";
import { useSiteInWorkspace } from "@/hooks/useSiteInWorkspace";
import { createProject, type Project } from "@/lib/api/userSvc";
import { createDesign, createSurvey, generateSurvey, listSurveys, type Survey } from "@/lib/api/orblodeSvc";
import { UPLOAD_ROW } from "@/lib/status";
import { CRS_OPTIONS, DATA_TYPES, TAG_SUGGESTIONS, VDATUM_OPTIONS } from "@/lib/upload/options";
import { uploadFiles, type AssetSlot } from "@/lib/upload/pipeline";
import {
  ACCEPT,
  DROPZONE_HINT,
  ROLE_LABELS,
  SELECTABLE_ROLES,
  buildProcessorPlan,
  designFormat,
  guessRole,
  roleNeedsHeader,
  roleToAssetKind,
  settleRole,
  type DataType,
  type FileRole,
  type PlannedSkip,
} from "@/lib/upload/planner";
import { refineRoles } from "@/lib/upload/rasterRole";
import { UploadTimeoutError } from "@/lib/upload/putToSignedUrl";
import { uploadApi } from "@/lib/upload/uploadApi";
import { useCurrentWorkspace, useWorkspaceSites, useWorkspaces } from "@/lib/workspaces/store";

// v2 (ORB-38): v1 drafts persisted the old unconfirmed `EPSG:4326` CRS default,
// so restoring one would smuggle that default straight back past the new
// explicit-choice requirement. Bumping the key retires those drafts.
const DRAFT_KEY = "orblode-upload-draft-v2";

interface QueuedFile {
  file: File;
  role: FileRole;
  readingRole: boolean;
  /** 0..1 while uploading. */
  progress: number;
  status: "queued" | "uploading" | "uploaded" | "error";
}

interface RunResult {
  surveyId: string | null;
  workflows: { label: string; id: string }[];
  designs: string[];
  skips: PlannedSkip[];
}

type Phase = "form" | "working" | "done";

/** What the current run has already accomplished (ORB-38).
 *
 * `run()` used to restart from createSurvey on every retry, so a failure
 * anywhere past step 2 duplicated the survey, its assets and its dispatched
 * workflows — and asset-svc exposes no survey/asset delete to clean the orphan
 * up (lib/api/assetSvc.ts has deleteMeasurement/deleteFolder only). Making the
 * retry RESUME is therefore the fix: each completed step is recorded here and
 * skipped next time round. Held in a ref — it is bookkeeping, never rendered. */
interface RunProgress {
  /** Which survey this progress belongs to (see `runTargetOf`). Progress is
   * only resumable while the form still targets the same survey. */
  target: string;
  /** Only set on the new-site path; prevents a retry creating a second site. */
  project: Project | null;
  survey: Survey | null;
  /** filename → slot. */
  assets: Record<string, AssetSlot>;
  /** PlannedDispatch.label → workflow id (labels embed the filename). */
  dispatched: Record<string, string>;
  /** filename → registered design name. */
  designs: Record<string, string>;
}

const emptyProgress = (target = ""): RunProgress => ({
  target,
  project: null,
  survey: null,
  assets: {},
  dispatched: {},
  designs: {},
});

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateHuman(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

export function UploadScreen() {
  const router = useRouter();

  // Destination
  const [destination, setDestination] = useState<"existing" | "new">("existing");
  const projects = useWorkspaceSites();
  const workspace = useCurrentWorkspace();
  const [siteId, setSiteId] = useState("");
  const [linkedSite, setLinkedSite] = useState<string | null>(null);
  const [newSiteName, setNewSiteName] = useState("");

  // Data
  const [dataType, setDataType] = useState<DataType>("preprocessed");
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [datasetName, setDatasetName] = useState("");
  // Whether the user has typed their own dataset name (stops the autofill).
  // State, not a ref — it is read during render to derive the shown name.
  const [datasetEdited, setDatasetEdited] = useState(false);
  const [surveyDate, setSurveyDate] = useState(todayISO());
  // ORB-38: no default. Defaulting to EPSG:4326 let a user upload without ever
  // looking at the CRS field, silently mis-registering every asset whose data
  // was in some projected CRS. Submit is blocked until this is explicitly set.
  const [epsg, setEpsg] = useState("");
  const [vdatum, setVdatum] = useState("EGM2008");
  const [tags, setTags] = useState<string[]>([]);

  // Run state
  const [phase, setPhase] = useState<Phase>("form");
  const [stepText, setStepText] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  // Resumable run bookkeeping (ORB-38). The ref holds the progress itself; the
  // state below is only what the footer renders about it.
  const progressRef = useRef<RunProgress>(emptyProgress());
  const [resume, setResume] = useState<{ target: string; text: string } | null>(null);

  // ?site=<id> preselects a site; ?new=1 opens the New-site path. Read from
  // window.location (not useSearchParams) so the page needs no Suspense
  // boundary for static prerender. URL + localStorage are external systems
  // only readable client-side, and seeding them via useState initializers
  // would mismatch the server-rendered HTML — a mount effect is the correct
  // place. React batches these mount setStates into a single re-render, so the
  // sync-setState lint is intentionally waived for this one effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const site = params.get("site");
    if (site) {
      setDestination("existing");
      setSiteId(site);
      setLinkedSite(site);
    } else if (params.get("new")) {
      setDestination("new");
    }

    // Restore the last draft (form fields only — File handles can't persist).
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        if (!site && typeof d.siteId === "string") setSiteId(d.siteId);
        if (!site && d.destination === "new") setDestination("new");
        if (typeof d.newSiteName === "string") setNewSiteName(d.newSiteName);
        if (typeof d.dataType === "string" && DATA_TYPES.some((t) => t.id === d.dataType)) {
          setDataType(d.dataType as DataType);
        }
        if (typeof d.datasetName === "string" && d.datasetName) {
          setDatasetName(d.datasetName);
          setDatasetEdited(true);
        }
        if (typeof d.epsg === "string") setEpsg(d.epsg);
        if (typeof d.vdatum === "string") setVdatum(d.vdatum);
        if (Array.isArray(d.tags)) setTags(d.tags.filter((t): t is string => typeof t === "string"));
        setDraftSaved(true);
      }
    } catch {
      // corrupted draft — ignore
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useSiteInWorkspace(siteId, setSiteId, linkedSite, false);

  // Persist the draft as the user edits (debounced). Only a user-edited
  // dataset name is saved — the autofilled one re-derives on restore.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            destination,
            siteId,
            newSiteName,
            dataType,
            datasetName: datasetEdited ? datasetName : "",
            epsg,
            vdatum,
            tags,
          })
        );
        setDraftSaved(true);
      } catch {
        // storage full/blocked — the dot just stays off
      }
    }, 600);
    return () => clearTimeout(t);
  }, [destination, siteId, newSiteName, dataType, datasetName, datasetEdited, epsg, vdatum, tags]);

  // Dataset name derives as "<site> — <date>" until the user edits it — a
  // render-time derivation (no effect), so it always tracks the current site
  // and date without cascading renders.
  const selectedProject = useMemo(() => projects.find((p) => p.id === siteId), [projects, siteId]);
  const siteNameForAutofill = destination === "new" ? newSiteName.trim() : selectedProject?.name;
  const effectiveDatasetName = datasetEdited
    ? datasetName
    : siteNameForAutofill
      ? `${siteNameForAutofill} — ${formatDateHuman(surveyDate)}`
      : "";

  // Partial progress is only resumable while the form still targets the SAME
  // survey. Retarget it (different site, data type or date) and the half-built
  // survey no longer belongs to what is being submitted, so `run()` discards the
  // progress and the resume notice below stops matching. Note `files` is
  // deliberately absent: adding or removing a file mid-retry is legitimate, and
  // the per-file slot map already handles it (a new file simply has no slot).
  const runTarget = `${destination}|${siteId}|${newSiteName.trim()}|${dataType}|${surveyDate}`;
  // Derived, not stored: a notice left over from a different target is stale by
  // construction, so it simply stops rendering — no ref writes during render.
  const resumeNotice = resume && resume.target === runTarget ? resume.text : null;

  const settle = useCallback((file: File, role: FileRole | null) => setFiles((prev) => settleRole(prev, file, role)), []);

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const added = Array.from(list);
      setFiles((prev) => {
        const next = [...prev];
        for (const f of added) {
          if (next.some((q) => q.file.name === f.name)) continue; // dedupe by name
          next.push({
            file: f,
            role: guessRole(f.name, dataType),
            readingRole: roleNeedsHeader(f.name, dataType),
            progress: 0,
            status: "queued",
          });
        }
        return next;
      });
      void refineRoles(added, dataType, settle);
    },
    [dataType, settle]
  );

  const changeDataType = (t: DataType) => {
    setDataType(t);
    // Roles are type-specific; re-guess rather than carrying stale roles over.
    setFiles((prev) => prev.map((q) => ({ ...q, role: guessRole(q.file.name, t), readingRole: roleNeedsHeader(q.file.name, t) })));
    void refineRoles(files.map((q) => q.file), t, settle);
  };

  const removeFile = (name: string) => setFiles((prev) => prev.filter((q) => q.file.name !== name));

  const setRole = (name: string, role: FileRole) =>
    setFiles((prev) => prev.map((q) => (q.file.name === name ? { ...q, role, readingRole: false } : q)));

  const canSubmit =
    phase === "form" &&
    files.length > 0 &&
    !files.some((q) => q.readingRole) &&
    effectiveDatasetName.trim().length > 0 &&
    // ORB-38: an explicit CRS choice is mandatory — see the `epsg` state above.
    epsg.length > 0 &&
    (destination === "existing" ? !!siteId : newSiteName.trim().length >= 2);

  /** Idempotent (ORB-38): every step records itself in `progressRef`, so a retry
   * after a mid-run failure resumes rather than re-creating the survey, the
   * assets and the dispatched workflows. */
  const run = async () => {
    // Discard progress belonging to a different survey before reusing it — the
    // form may have been retargeted since the failed attempt.
    if (progressRef.current.target !== runTarget) {
      progressRef.current = emptyProgress(runTarget);
    }
    const progress = progressRef.current;
    setPhase("working");
    setResume(null);
    // A retry re-attempts the files that failed last time — clear their badge.
    setFiles((prev) =>
      prev.map((p) => (p.status === "error" ? { ...p, status: "queued", progress: 0 } : p))
    );
    try {
      // 1) Resolve the destination project. On the new-site path this is cached
      //    so a retry cannot create a second site.
      let resolvedProject = destination === "new" ? progress.project : (selectedProject ?? null);
      if (destination === "new" && !resolvedProject) {
        setStepText("Creating site…");
        resolvedProject = await createProject({
          workspace_id: workspace?.id,
          name: newSiteName.trim(),
          crs_epsg: Number(epsg.replace("EPSG:", "")) || undefined,
          crs_label: CRS_OPTIONS.find((o) => o.value === epsg)?.label,
          vertical_datum: vdatum,
        });
        progress.project = resolvedProject;
        void useWorkspaces.getState().refresh();
      }
      if (!resolvedProject) throw new Error("Select a site first");
      const project = resolvedProject;

      // 2) Resolve the survey that hosts the upload. Data uploads are a new
      //    epoch (new survey); designs attach to the latest existing survey's
      //    storage folder, creating one only when the project has none.
      let resolvedSurvey = progress.survey;
      if (!resolvedSurvey) {
        if (dataType === "design") {
          setStepText("Resolving survey…");
          const { surveys } = await listSurveys(project.id);
          const latest = [...(surveys || [])].sort((a, b) =>
            b.survey_date.localeCompare(a.survey_date)
          )[0];
          resolvedSurvey =
            latest ??
            (await createSurvey({
              project_id: project.id,
              survey_date: surveyDate,
              survey_type: "design",
              metadata: { dataset_name: effectiveDatasetName.trim(), tags, source: "platform-upload" },
            }));
        } else {
          setStepText("Creating survey…");
          resolvedSurvey = await createSurvey({
            project_id: project.id,
            survey_date: surveyDate,
            survey_type: dataType === "lidar" ? "lidar" : "preprocessed",
            metadata: {
              dataset_name: effectiveDatasetName.trim(),
              tags,
              source: "platform-upload",
              source_crs: epsg,
              source_vertical_datum: vdatum,
            },
          });
        }
        progress.survey = resolvedSurvey;
      }
      const survey = resolvedSurvey;

      // 3) Signed upload slots for files that have none yet, then PUT each file
      //    and mark it uploaded; a retry resumes from `progress.assets`.
      await uploadFiles(uploadApi, {
        surveyId: survey.id,
        files: files.map((q) => ({ file: q.file, kind: roleToAssetKind(q.role), role: q.role, crs: epsg })),
        slots: progress.assets,
        onStep: setStepText,
        onStatus: (name, status) =>
          setFiles((prev) =>
            prev.map((p) => (p.file.name === name ? { ...p, status, ...(status === "uploaded" ? { progress: 1 } : {}) } : p))
          ),
        onProgress: (name, frac) =>
          setFiles((prev) => prev.map((p) => (p.file.name === name ? { ...p, progress: frac } : p))),
      });

      // 4) Dispatch processing / register designs — each recorded so a later
      //    failure never re-fires an already-accepted workflow.
      const outcome: RunResult = { surveyId: survey.id, workflows: [], designs: [], skips: [] };
      if (dataType === "design") {
        for (const q of files) {
          const already = progress.designs[q.file.name];
          if (already) {
            outcome.designs.push(already);
            continue;
          }
          setStepText(`Registering design ${q.file.name}…`);
          const d = await createDesign({
            project_id: project.id,
            name: files.length === 1 ? effectiveDatasetName.trim() : q.file.name,
            format: designFormat(q.file.name),
            file_url: progress.assets[q.file.name]?.url || "",
            source_crs: epsg,
            metadata: { tags, source: "platform-upload" },
          });
          progress.designs[q.file.name] = d.name;
          outcome.designs.push(d.name);
        }
      } else {
        const plan = buildProcessorPlan(
          files.map((q) => ({
            name: q.file.name,
            role: q.role,
            url: progress.assets[q.file.name]?.url || "",
          })),
          { epsg }
        );
        outcome.skips = plan.skips;
        for (const d of plan.dispatches) {
          const already = progress.dispatched[d.label];
          if (already) {
            outcome.workflows.push({ label: d.label, id: already });
            continue;
          }
          setStepText(`Dispatching ${d.label}…`);
          const res = await generateSurvey(survey.id, { ...d.request, version: "v1" });
          progress.dispatched[d.label] = res.workflow_id;
          outcome.workflows.push({ label: d.label, id: res.workflow_id });
        }
      }

      localStorage.removeItem(DRAFT_KEY);
      progressRef.current = emptyProgress(); // run finished — next submit starts fresh
      setResult(outcome);
      setPhase("done");
      toast.success(
        dataType === "design"
          ? `${outcome.designs.length} design${outcome.designs.length === 1 ? "" : "s"} registered`
          : `Upload complete — ${outcome.workflows.length} processing workflow${outcome.workflows.length === 1 ? "" : "s"} dispatched`
      );
    } catch (err) {
      console.error("Upload & process failed:", err);
      const base = err instanceof Error ? err.message : "Upload failed";
      toast.error(
        err instanceof UploadTimeoutError
          ? `${base} — retry to resume from where it stopped.`
          : base
      );
      // Recoverable: back to the form with the partial progress intact, so the
      // retry picks up where this attempt died instead of duplicating it.
      setPhase("form");
      setStepText("");
      const done = Object.values(progress.assets).filter((a) => a.uploaded && a.marked).length;
      setResume(
        progress.survey
          ? {
              target: runTarget,
              text: `Survey already created — ${done} of ${files.length} file${files.length === 1 ? "" : "s"} uploaded. Retry resumes from there.`,
            }
          : null
      );
    }
  };

  const working = phase === "working";
  const footerNote = working ? (
    <span className="flex items-center gap-2">
      <ProgressCircle value={null} size="sm" aria-label="Working" />
      {stepText}
    </span>
  ) : resumeNotice ? (
    <span className="flex items-center gap-2">
      <Glyph shape="redo" />
      {resumeNotice}
    </span>
  ) : draftSaved ? (
    <span className="flex items-center gap-2">
      <Glyph shape="check" />
      Saved as draft
    </span>
  ) : null;

  return (
    <Page>
      <PageHeader title="Upload" subtitle="Add survey data or designs to your site" />

      {phase === "done" && result ? (
        <DoneSummary
          result={result}
          dataType={dataType}
          onOpenViewer={() => result.surveyId && router.push(`/viewer/${result.surveyId}`)}
          onAgain={() => {
            setFiles([]);
            setResult(null);
            setPhase("form");
            setStepText("");
            progressRef.current = emptyProgress();
            setResume(null);
          }}
          onDashboard={() => router.push("/globe")}
        />
      ) : (
        <div className="flex max-w-3xl flex-col gap-8">
          <section className="flex flex-col gap-3">
            <p className="caps text-4">Destination</p>
            <SegmentedControl<"existing" | "new">
              aria-label="Destination"
              value={destination}
              onValueChange={(v) => !working && setDestination(v)}
              options={[
                { value: "existing", label: "Existing site" },
                { value: "new", label: "New site" },
              ]}
            />
            {destination === "existing" ? (
              <Field label="Site">
                <SearchSelect
                  value={siteId || null}
                  onValueChange={setSiteId}
                  disabled={working}
                  placeholder="Select a site…"
                  searchPlaceholder="Find a site"
                  options={projects.map((p) => ({ value: p.id, label: p.name, meta: p.location_name ?? undefined }))}
                  empty={(query) => (query ? `No site matches “${query}”.` : "No sites yet. Switch to New site to create one.")}
                />
              </Field>
            ) : (
              <Field label="New site name" hint={workspace ? `It goes in the ${workspace.name} workspace.` : undefined}>
                <Input value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} disabled={working} placeholder="e.g. Bandalkop pit" />
              </Field>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <p className="caps text-4">Data type</p>
            <SegmentedControl<DataType>
              aria-label="Data type"
              value={dataType}
              onValueChange={(v) => !working && changeDataType(v)}
              options={DATA_TYPES.map((t) => ({ value: t.id, label: t.label }))}
            />
            <Dropzone
              onFiles={(list) => phase === "form" && addFiles(list)}
              accept={ACCEPT[dataType]}
              multiple
              disabled={phase !== "form"}
              title="Drag & drop files here, or browse"
              hint={DROPZONE_HINT[dataType]}
            />
            {files.length > 0 && (
              <ul className="flex flex-col gap-2">
                {files.map((q) => (
                  <li key={q.file.name} className="rounded-md border border-hairline bg-surface px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Icon icon={File01Icon} size={16} className="shrink-0 text-ink-4" />
                      <span className="small min-w-0 flex-1 truncate text-ink-1">{q.file.name}</span>
                      <span className="num-sm shrink-0 text-ink-4">{formatBytes(q.file.size)}</span>
                      <Select
                        variant="filter"
                        aria-label={`Role of ${q.file.name}`}
                        value={q.role}
                        onValueChange={(v) => setRole(q.file.name, v as FileRole)}
                        disabled={working || SELECTABLE_ROLES[dataType].length < 2}
                        options={SELECTABLE_ROLES[dataType].map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                      />
                      {phase === "form" ? (
                        <IconButton icon={Cancel01Icon} aria-label={`Remove ${q.file.name}`} variant="bare" size="sm" onClick={() => removeFile(q.file.name)} />
                      ) : q.status !== "queued" ? (
                        <StateChip state={UPLOAD_ROW[q.status]} />
                      ) : null}
                    </div>
                    {(q.status === "uploading" || q.status === "uploaded") && (
                      <Progress value={Math.round(q.progress * 100)} size="thin" aria-label={`${q.file.name} upload`} className="mt-2" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid grid-cols-[minmax(0,1fr)_200px] gap-3">
            <Field label="Dataset name">
              <Input
                value={effectiveDatasetName}
                onChange={(e) => {
                  setDatasetEdited(true);
                  setDatasetName(e.target.value);
                }}
                disabled={working}
                placeholder="Site — date"
              />
            </Field>
            <Field label="Survey date">
              <DateInput value={surveyDate} onChange={(v) => v && setSurveyDate(v)} disabled={working} />
            </Field>
          </section>

          <section className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Coordinate reference system"
                required
                hint={
                  epsg
                    ? "Assets are registered in this CRS — it must match what the files actually contain."
                    : "Required. Pick the CRS your files are actually in; an incorrect choice mis-registers the whole dataset."
                }
              >
                <Select value={epsg || undefined} onValueChange={setEpsg} disabled={working} placeholder="Select the CRS of your files…" options={CRS_OPTIONS} />
              </Field>
              <Field label="Vertical datum">
                <Select value={vdatum} onValueChange={setVdatum} disabled={working} options={VDATUM_OPTIONS} />
              </Field>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <p className="caps text-4">Tags</p>
            <TagInput tags={tags} onChange={setTags} suggestions={TAG_SUGGESTIONS} disabled={working} />
          </section>

          <FormFooter note={footerNote}>
            <Button variant="quiet" disabled={working} onClick={() => router.push("/globe")}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!canSubmit} loading={working} onClick={run}>
              {working ? "Working…" : resumeNotice ? "Retry upload" : "Upload & process"}
            </Button>
          </FormFooter>
        </div>
      )}
    </Page>
  );
}

function DoneSummary({
  result,
  dataType,
  onOpenViewer,
  onAgain,
  onDashboard,
}: {
  result: RunResult;
  dataType: DataType;
  onOpenViewer: () => void;
  onAgain: () => void;
  onDashboard: () => void;
}) {
  return (
    <Card className="max-w-3xl">
      <h2 className="h2 mb-1">{dataType === "design" ? "Designs registered" : "Upload complete — processing dispatched"}</h2>
      <p className="small text-ink-3 mb-5">
        {dataType === "design"
          ? "The design files are stored and attached to the project."
          : "Processors are running; layers appear in the viewer as each one completes."}
      </p>

      {result.workflows.length > 0 && (
        <div className="mb-4">
          <PushOffer />
        </div>
      )}

      {result.workflows.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1.5">
          {result.workflows.map((w) => (
            <li key={w.id} className="flex items-baseline justify-between gap-3">
              <span className="small min-w-0 truncate text-ink-2">{w.label}</span>
              <span className="num-sm shrink-0 text-ink-4">{w.id}</span>
            </li>
          ))}
        </ul>
      )}

      {result.designs.length > 0 && (
        <ul className="mb-4 flex flex-col gap-1.5">
          {result.designs.map((d) => (
            <li key={d} className="small text-ink-2">
              {d}
            </li>
          ))}
        </ul>
      )}

      {result.skips.length > 0 && (
        <Alert tone="warning" title="Some files were stored but not processed" className="mb-4">
          {result.skips.map((s) => (
            <p key={s.filename}>
              {s.filename}: {s.reason}
            </p>
          ))}
        </Alert>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {result.surveyId && dataType !== "design" && (
          <Button variant="primary" onClick={onOpenViewer}>
            Open in viewer
          </Button>
        )}
        <Button variant="quiet" onClick={onAgain}>
          Upload more
        </Button>
        <Button variant="ghost" onClick={onDashboard}>
          Back to dashboard
        </Button>
      </div>
    </Card>
  );
}
