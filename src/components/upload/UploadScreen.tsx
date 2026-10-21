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
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  toast,
} from "@puckoops/camelot";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StateChip } from "@/components/common/StateChip";
import { TagInput } from "@/components/common/TagInput";
import { PushOffer } from "@/components/notifications/PushOffer";
import { useDetectionPoll } from "@/hooks/useDetectionPoll";
import { useSiteInWorkspace } from "@/hooks/useSiteInWorkspace";
import { refusalMessage } from "@/lib/api/client";
import { createProject, updateProject, type Project } from "@/lib/api/userSvc";
import {
  createDesign,
  createSurvey,
  generateSurvey,
  inspectAsset,
  listSurveyAssets,
  listSurveys,
  updateSurveyAsset,
  type SourceAsset,
  type Survey,
} from "@/lib/api/orblodeSvc";
import { NEEDS_CRS, PRELIMINARY_CRS, READING_FILE, UPLOAD_ROW, crsSourceState } from "@/lib/status";
import { CRS_OPTIONS, DATA_TYPES, TAG_SUGGESTIONS, VDATUM_OPTIONS, withCurrent } from "@/lib/upload/options";
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
import {
  buildReviewRows,
  canProcess,
  crsChoices,
  fileWarnings,
  isInspecting,
  plannedFiles,
  reviewPatches,
  rowsMissingCrs,
  siteCrsFrom,
  type ReviewRow,
  type RowEdit,
} from "@/lib/upload/review";
import { quickRead } from "@/lib/upload/sniff";
import { uploadApi } from "@/lib/upload/uploadApi";
import { useCurrentWorkspace, useWorkspaceSites, useWorkspaces } from "@/lib/workspaces/store";

// v3: the CRS and datum became fallbacks for files that don't say (`fallbackCrs`,
// `fallbackDatum`). A v2 draft's datum was the old EGM2008 default rather than a
// choice, and restoring it would declare that datum for every file.
const DRAFT_KEY = "orblode-upload-draft-v3";

interface QueuedFile {
  file: File;
  role: FileRole;
  readingRole: boolean;
  roleByHand: boolean;
  /** What the browser read from the file's start; the server's read of the header replaces it. */
  fileCrs: string | null;
  /** 0..1 while uploading. */
  progress: number;
  status: "queued" | "uploading" | "uploaded" | "error";
}

interface RunResult {
  surveyId: string | null;
  workflows: { label: string; id: string }[];
  designs: string[];
  skips: PlannedSkip[];
  warnings: { filename: string; warnings: string[] }[];
  /** A new site created without a CRS, given the one most of its files use. */
  siteCrs: { label: string; error: string | null } | null;
}

type Phase = "form" | "working" | "review" | "done";

/** The uploaded files under review: which asset each is, and the role the queue gave it. */
interface ReviewTarget {
  surveyId: string;
  projectId: string;
  entries: { assetId: string; queuedRole: FileRole; roleByHand: boolean }[];
}

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
  /** A new site created without a CRS has been given one, or the attempt was reported. */
  siteCrsDone: boolean;
}

const emptyProgress = (target = ""): RunProgress => ({
  target,
  project: null,
  survey: null,
  assets: {},
  dispatched: {},
  designs: {},
  siteCrsDone: false,
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

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
  const [chosenDestination, setDestination] = useState<"existing" | "new">("existing");
  const projects = useWorkspaceSites();
  const workspace = useCurrentWorkspace();
  // Without a workspace to ask, the server decides when the site is made.
  const mayCreateSite = workspace?.can_create_project ?? true;
  const destination = mayCreateSite ? chosenDestination : "existing";
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
  // No defaults (ORB-38): a defaulted CRS mis-registered every file whose header
  // said nothing. These apply only to such files; a file's own header wins.
  const [fallbackCrs, setFallbackCrs] = useState("");
  const [fallbackDatum, setFallbackDatum] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Run state
  const [phase, setPhase] = useState<Phase>("form");
  const [stepText, setStepText] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  // Resumable run bookkeeping (ORB-38). The ref holds the progress itself; the
  // state below is only what the footer renders about it.
  const progressRef = useRef<RunProgress>(emptyProgress());
  const [resume, setResume] = useState<{ target: string; text: string; reviewing: boolean } | null>(null);

  // Review state: the assets as last polled, what the person changed, and when they were checked.
  const [review, setReview] = useState<ReviewTarget | null>(null);
  const [reviewAssets, setReviewAssets] = useState<Record<string, SourceAsset>>({});
  const [reviewEdits, setReviewEdits] = useState<Record<string, RowEdit>>({});
  const [checkedAt, setCheckedAt] = useState(0);
  const [pollRound, setPollRound] = useState(0);
  const [skipWaiting, setSkipWaiting] = useState(false);
  const [redetecting, setRedetecting] = useState<ReadonlySet<string>>(new Set());
  const [processing, setProcessing] = useState(false);

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
        if (typeof d.fallbackCrs === "string") setFallbackCrs(d.fallbackCrs);
        if (typeof d.fallbackDatum === "string") setFallbackDatum(d.fallbackDatum);
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
            fallbackCrs,
            fallbackDatum,
            tags,
          })
        );
        setDraftSaved(true);
      } catch {
        // storage full/blocked — the dot just stays off
      }
    }, 600);
    return () => clearTimeout(t);
  }, [destination, siteId, newSiteName, dataType, datasetName, datasetEdited, fallbackCrs, fallbackDatum, tags]);

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
            roleByHand: false,
            fileCrs: null,
            progress: 0,
            status: "queued",
          });
        }
        return next;
      });
      for (const f of added) {
        void quickRead(f).then(({ role, crs }) => {
          settle(f, role);
          if (crs) setFiles((prev) => prev.map((q) => (q.file === f ? { ...q, fileCrs: crs } : q)));
        });
      }
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
    setFiles((prev) => prev.map((q) => (q.file.name === name ? { ...q, role, readingRole: false, roleByHand: true } : q)));

  const canSubmit =
    phase === "form" &&
    files.length > 0 &&
    !files.some((q) => q.readingRole) &&
    effectiveDatasetName.trim().length > 0 &&
    (destination === "existing" ? !!siteId : newSiteName.trim().length >= 2);

  const loadDetections = useCallback(async () => {
    if (!review) return false;
    const { assets } = await listSurveyAssets(review.surveyId);
    const ids = new Set(review.entries.map((e) => e.assetId));
    const mine = (assets || []).filter((a) => ids.has(a.id));
    const now = Date.now();
    setReviewAssets((prev) => ({ ...prev, ...Object.fromEntries(mine.map((a) => [a.id, a])) }));
    setCheckedAt(now);
    return mine.length < ids.size || mine.some((a) => isInspecting(a, now));
  }, [review]);

  const poll = useDetectionPoll(loadDetections, phase === "review" ? pollRound : null);

  const reviewRows = useMemo(() => {
    if (!review) return [];
    const entries = review.entries.flatMap((e) => {
      const asset = reviewAssets[e.assetId];
      return asset ? [{ asset, queuedRole: e.queuedRole, roleByHand: e.roleByHand }] : [];
    });
    return buildReviewRows(entries, reviewEdits, dataType, checkedAt);
  }, [review, reviewAssets, reviewEdits, dataType, checkedAt]);
  const reviewComplete = !!review && reviewRows.length === review.entries.length;

  const editRow = (assetId: string, change: RowEdit) => setReviewEdits((prev) => ({ ...prev, [assetId]: { ...prev[assetId], ...change } }));

  const detectAgain = async (assetId: string) => {
    if (!review) return;
    setRedetecting((prev) => new Set(prev).add(assetId));
    try {
      const asset = await inspectAsset(review.surveyId, assetId);
      setReviewAssets((prev) => ({ ...prev, [asset.id]: asset }));
      setCheckedAt(Date.now());
      setPollRound((r) => r + 1);
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't ask for the file to be read again. Try again."));
    } finally {
      setRedetecting((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    }
  };

  const startReview = (surveyId: string, projectId: string, progress: RunProgress) => {
    const entries = files.flatMap((q) => {
      const slot = progress.assets[q.file.name];
      return slot ? [{ assetId: slot.assetId, queuedRole: q.role, roleByHand: q.roleByHand }] : [];
    });
    const marked = Object.values(progress.assets).flatMap((slot) => (slot.asset ? [[slot.assetId, slot.asset] as const] : []));
    setReview({ surveyId, projectId, entries });
    setReviewAssets((prev) => ({ ...Object.fromEntries(marked), ...prev }));
    setCheckedAt(Date.now());
    setPollRound((r) => r + 1);
    setPhase("review");
    setStepText("");
  };

  const backToForm = () => {
    setPhase("form");
    setResume({
      target: runTarget,
      reviewing: true,
      text: `${plural(review?.entries.length ?? 0, "file")} uploaded. Continue picks up at the review.`,
    });
  };

  /** Idempotent (ORB-38): every step records itself in `progressRef`, so a retry
   * after a mid-run failure resumes rather than re-creating the survey, the
   * assets and the dispatched workflows. */
  const run = async () => {
    // Discard progress belonging to a different survey before reusing it — the
    // form may have been retargeted since the failed attempt.
    if (progressRef.current.target !== runTarget) {
      progressRef.current = emptyProgress(runTarget);
      setReview(null);
      setReviewAssets({});
      setReviewEdits({});
      setSkipWaiting(false);
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
          crs_epsg: Number(fallbackCrs.replace("EPSG:", "")) || undefined,
          crs_label: CRS_OPTIONS.find((o) => o.value === fallbackCrs)?.label,
          vertical_datum: fallbackDatum || undefined,
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
              ...(fallbackCrs ? { source_crs: fallbackCrs } : {}),
              ...(fallbackDatum ? { source_vertical_datum: fallbackDatum } : {}),
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
        files: files.map((q) => ({
          file: q.file,
          kind: roleToAssetKind(q.role),
          role: q.role,
          declaredCrs: fallbackCrs || undefined,
          declaredVerticalDatum: fallbackDatum || undefined,
        })),
        slots: progress.assets,
        onStep: setStepText,
        onStatus: (name, status) =>
          setFiles((prev) =>
            prev.map((p) => (p.file.name === name ? { ...p, status, ...(status === "uploaded" ? { progress: 1 } : {}) } : p))
          ),
        onProgress: (name, frac) =>
          setFiles((prev) => prev.map((p) => (p.file.name === name ? { ...p, progress: frac } : p))),
      });

      // 4) The review: the server reads each file's header while the person checks the table.
      startReview(survey.id, project.id, progress);
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
              reviewing: false,
              text: `Survey already created — ${done} of ${files.length} file${files.length === 1 ? "" : "s"} uploaded. Retry resumes from there.`,
            }
          : null
      );
    }
  };

  /** Saves the review's changes, then dispatches each file in its own CRS (or registers each design in
   * its own). Every step records itself in `progressRef`, so a retry after a failure re-sends nothing
   * that already landed; the review stays open for it. */
  const processReview = async () => {
    if (!review) return;
    const progress = progressRef.current;
    const rows = reviewRows;
    setProcessing(true);
    try {
      for (const p of reviewPatches(rows, reviewEdits)) {
        setStepText(`Saving ${p.name}…`);
        const saved = await updateSurveyAsset(review.surveyId, p.assetId, p.patch);
        setReviewAssets((prev) => ({ ...prev, [p.assetId]: { ...prev[p.assetId], ...saved } }));
      }

      const outcome: RunResult = { surveyId: review.surveyId, workflows: [], designs: [], skips: [], warnings: fileWarnings(rows), siteCrs: null };
      if (dataType === "design") {
        for (const row of rows) {
          const already = progress.designs[row.name];
          if (already) {
            outcome.designs.push(already);
            continue;
          }
          setStepText(`Registering design ${row.name}…`);
          const d = await createDesign({
            project_id: review.projectId,
            name: rows.length === 1 ? effectiveDatasetName.trim() : row.name,
            format: designFormat(row.name),
            file_url: row.asset.url,
            source_crs: row.crs || undefined,
            metadata: { tags, source: "platform-upload" },
          });
          progress.designs[row.name] = d.name;
          outcome.designs.push(d.name);
        }
      } else {
        const plan = buildProcessorPlan(plannedFiles(rows), { epsg: fallbackCrs });
        outcome.skips = plan.skips.map((s) => ({ ...s, reason: rows.find((r) => r.name === s.filename)?.skipReason ?? s.reason }));
        for (const d of plan.dispatches) {
          const already = progress.dispatched[d.label];
          if (already) {
            outcome.workflows.push({ label: d.label, id: already });
            continue;
          }
          setStepText(`Dispatching ${d.label}…`);
          const res = await generateSurvey(review.surveyId, { ...d.request, version: "v1" });
          progress.dispatched[d.label] = res.workflow_id;
          outcome.workflows.push({ label: d.label, id: res.workflow_id });
        }
      }

      if (progress.project && !progress.project.crs_epsg && !progress.siteCrsDone) {
        const site = siteCrsFrom(rows);
        if (site) {
          setStepText("Setting the site's CRS…");
          try {
            progress.project = await updateProject(progress.project.id, {
              crs_epsg: Number(site.epsg.replace(/^EPSG:/i, "")),
              crs_label: site.label,
            });
            void useWorkspaces.getState().refresh();
            outcome.siteCrs = { label: site.label, error: null };
          } catch (err) {
            outcome.siteCrs = { label: site.label, error: refusalMessage(err, "the change was refused") };
          }
        }
        progress.siteCrsDone = true;
      }

      localStorage.removeItem(DRAFT_KEY);
      progressRef.current = emptyProgress(); // run finished — next submit starts fresh
      setReview(null);
      setReviewAssets({});
      setReviewEdits({});
      setSkipWaiting(false);
      setResult(outcome);
      setPhase("done");
      toast.success(
        dataType === "design"
          ? `${outcome.designs.length} design${outcome.designs.length === 1 ? "" : "s"} registered`
          : `Upload complete — ${outcome.workflows.length} processing workflow${outcome.workflows.length === 1 ? "" : "s"} dispatched`
      );
    } catch (err) {
      console.error("Processing the upload failed:", err);
      toast.error(`${err instanceof Error ? err.message : "Processing couldn't start"} — retry to carry on from where it stopped.`);
    } finally {
      setProcessing(false);
      setStepText("");
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
      <PageHeader title="Create" subtitle="Add survey data or designs to your site" />

      {phase === "review" && review ? (
        <ReviewCard
          rows={reviewRows}
          complete={reviewComplete}
          dataType={dataType}
          polling={poll.polling}
          timedOut={poll.timedOut}
          skipWaiting={skipWaiting}
          processing={processing}
          stepText={stepText}
          redetecting={redetecting}
          onEdit={editRow}
          onDetectAgain={(id) => void detectAgain(id)}
          onSkipWaiting={() => setSkipWaiting(true)}
          onBack={backToForm}
          onProcess={() => void processReview()}
        />
      ) : phase === "done" && result ? (
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
          onDashboard={() => router.push("/projects")}
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
                ...(mayCreateSite ? [{ value: "new" as const, label: "New site" }] : []),
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
                    {q.fileCrs && (
                      <div className="mt-2 flex items-center gap-2 pl-7">
                        <span className="num-sm text-ink-3">{CRS_OPTIONS.find((o) => o.value === q.fileCrs)?.label ?? q.fileCrs}</span>
                        <StateChip state={PRELIMINARY_CRS} />
                      </div>
                    )}
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
                label="CRS for files that don't say"
                hint="Optional. Each file's own CRS comes first; you can check and change every file's after the upload."
              >
                <Select value={fallbackCrs} onValueChange={setFallbackCrs} disabled={working} allLabel="None" options={withCurrent(CRS_OPTIONS, fallbackCrs)} />
              </Field>
              <Field label="Vertical datum for files that don't say" hint="Optional, like the CRS.">
                <Select value={fallbackDatum} onValueChange={setFallbackDatum} disabled={working} allLabel="None" options={VDATUM_OPTIONS} />
              </Field>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <p className="caps text-4">Tags</p>
            <TagInput tags={tags} onChange={setTags} suggestions={TAG_SUGGESTIONS} disabled={working} />
          </section>

          <FormFooter note={footerNote}>
            <Button variant="quiet" disabled={working} onClick={() => router.push("/projects")}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!canSubmit} loading={working} onClick={run}>
              {working ? "Working…" : resumeNotice ? (resume?.reviewing ? "Continue to review" : "Retry upload") : "Upload & review"}
            </Button>
          </FormFooter>
        </div>
      )}
    </Page>
  );
}

function crsChip(row: ReviewRow, timedOut: boolean) {
  if (row.inspecting && row.crsSource !== "you") return timedOut ? { ...READING_FILE, label: "Still reading the file" } : READING_FILE;
  if (row.crsSource) return crsSourceState(row.crsSource, row.asset.detection?.crs?.confidence);
  return row.skipReason === null && !row.crs ? NEEDS_CRS : null;
}

function ReviewCard({
  rows,
  complete,
  dataType,
  polling,
  timedOut,
  skipWaiting,
  processing,
  stepText,
  redetecting,
  onEdit,
  onDetectAgain,
  onSkipWaiting,
  onBack,
  onProcess,
}: {
  rows: ReviewRow[];
  complete: boolean;
  dataType: DataType;
  polling: boolean;
  timedOut: boolean;
  skipWaiting: boolean;
  processing: boolean;
  stepText: string;
  redetecting: ReadonlySet<string>;
  onEdit: (assetId: string, change: RowEdit) => void;
  onDetectAgain: (assetId: string) => void;
  onSkipWaiting: () => void;
  onBack: () => void;
  onProcess: () => void;
}) {
  const roles = SELECTABLE_ROLES[dataType];
  const reading = rows.filter((r) => r.inspecting).length;
  const missing = rowsMissingCrs(rows);
  const processed = rows.filter((r) => r.skipReason === null).length;
  const ready = complete && canProcess(rows, skipWaiting);

  const note = processing ? (
    <span className="flex items-center gap-2">
      <ProgressCircle value={null} size="sm" aria-label="Working" />
      {stepText}
    </span>
  ) : reading > 0 && !skipWaiting ? (
    <span className="flex items-center gap-2">
      {polling && <ProgressCircle value={null} size="sm" aria-label="Reading files" />}
      {polling ? `Reading ${plural(reading, "file")}…` : `${plural(reading, "file")} still being read.`}
    </span>
  ) : missing.length > 0 ? (
    `Pick a CRS for ${plural(missing.length, "file")} to carry on.`
  ) : null;

  return (
    <Card className="max-w-6xl">
      <h2 className="h2 mb-1">Check your files</h2>
      <p className="small text-ink-3 mb-5">
        Orblode reads each file for what it is and the CRS it&apos;s in. Change anything that&apos;s wrong; your choices win over what was read.
      </p>

      <Table minWidth={760}>
        <THead>
          <Tr>
            <Th>File</Th>
            <Th>Role</Th>
            <Th>CRS</Th>
            <Th>Vertical datum</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.map((row) => {
            const chip = crsChip(row, timedOut);
            const offerAgain = row.detectAgain || (timedOut && row.inspecting);
            const notes = [...(row.skipReason ? [row.skipReason] : []), ...row.notes];
            return (
              <Tr key={row.assetId}>
                <Td primary>
                  <span className="block max-w-64 truncate" title={row.name}>
                    {row.name}
                  </span>
                  {row.asset.detection?.format && (
                    <span className="caption block text-ink-4">
                      {row.asset.detection.format}
                      {row.asset.detection.inspected_member ? ` → ${row.asset.detection.inspected_member}` : ""}
                    </span>
                  )}
                  {notes.map((n) => (
                    <span key={n} className="caption mt-1 block max-w-72 text-ink-2">
                      {n}
                    </span>
                  ))}
                  {offerAgain && (
                    <Button className="mt-1" size="sm" variant="ghost" loading={redetecting.has(row.assetId)} disabled={processing} onClick={() => onDetectAgain(row.assetId)}>
                      Detect again
                    </Button>
                  )}
                </Td>
                <Td>
                  <Select
                    aria-label={`Role of ${row.name}`}
                    className="min-w-36"
                    value={row.role}
                    onValueChange={(v) => onEdit(row.assetId, { role: v as FileRole })}
                    disabled={processing || roles.length < 2}
                    options={withCurrent(
                      roles.map((r) => ({ value: r as string, label: ROLE_LABELS[r] })),
                      row.role
                    )}
                  />
                </Td>
                <Td>
                  <div className="flex min-w-56 flex-col items-start gap-1.5">
                    <SearchSelect
                      aria-label={`CRS of ${row.name}`}
                      value={row.crs || null}
                      onValueChange={(v) => onEdit(row.assetId, { crs: v })}
                      disabled={processing}
                      placeholder={row.skipReason === null ? "Pick a CRS…" : "Not needed"}
                      searchPlaceholder="Find a CRS"
                      options={crsChoices(row.asset, row.crs).map((o) => ({ ...o, meta: o.value, keywords: [o.value] }))}
                      empty={(query) => `No CRS matches “${query}”.`}
                      className="w-full"
                    />
                    {chip && <StateChip state={chip} />}
                  </div>
                </Td>
                <Td>
                  <Select
                    aria-label={`Vertical datum of ${row.name}`}
                    value={row.verticalDatum || undefined}
                    onValueChange={(v) => onEdit(row.assetId, { verticalDatum: v })}
                    disabled={processing}
                    placeholder="Not set"
                    options={withCurrent(VDATUM_OPTIONS, row.verticalDatum)}
                  />
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>

      <FormFooter note={note} sticky={false} className="mt-6">
        <Button variant="quiet" disabled={processing} onClick={onBack}>
          Back
        </Button>
        {reading > 0 && !skipWaiting && (
          <Button variant="ghost" disabled={processing} onClick={onSkipWaiting}>
            Skip waiting
          </Button>
        )}
        <Button variant="primary" disabled={!ready || processing} loading={processing} onClick={onProcess}>
          {dataType === "design"
            ? `Register ${plural(rows.length, "design")}`
            : processed > 0
              ? `Process ${plural(processed, "file")}`
              : "Finish"}
        </Button>
      </FormFooter>
    </Card>
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
          : "Processors are running. The survey opens in the viewer once they finish."}
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

      {result.warnings.length > 0 && (
        <Alert tone="warning" title="Check these files" className="mb-4">
          {result.warnings.map((w) => (
            <p key={w.filename}>
              {w.filename}: {w.warnings.join(" · ")}
            </p>
          ))}
        </Alert>
      )}

      {result.siteCrs &&
        (result.siteCrs.error ? (
          <Alert tone="warning" title="The new site has no CRS yet" className="mb-4">
            Setting it to {result.siteCrs.label}, the one most of its files use, failed: {result.siteCrs.error}
          </Alert>
        ) : (
          <p className="small text-ink-3 mb-4">The new site&apos;s CRS is now {result.siteCrs.label}, the one most of its files use.</p>
        ))}

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
