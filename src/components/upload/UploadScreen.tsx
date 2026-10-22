"use client";

import { Cancel01Icon, File01Icon } from "@hugeicons/core-free-icons";
import {
  Button,
  Card,
  Checkbox,
  Chip,
  DateInput,
  Dropzone,
  Field,
  Glyph,
  HelperText,
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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StateChip } from "@/components/common/StateChip";
import { TagInput } from "@/components/common/TagInput";
import type { MarkablePhoto } from "@/components/mm/GcpMarking";
import { PushOffer } from "@/components/notifications/PushOffer";
import { ProcessingDialog } from "@/components/processing/ProcessingDialog";
import { useDetectionPoll } from "@/hooks/useDetectionPoll";
import { useSiteInWorkspace } from "@/hooks/useSiteInWorkspace";
import { refusalMessage } from "@/lib/api/client";
import { createProject, updateProject, type Project } from "@/lib/api/userSvc";
import {
  beginPhotoFlight,
  createDesign,
  createSurvey,
  generateSurvey,
  inspectAsset,
  listDesigns,
  listSiteVectors,
  listSurveyAssets,
  listSurveys,
  processSurveyPhotos,
  saveGcpFile,
  signSurveyPhotos,
  surveyPhotos,
  updateSurveyAsset,
  type DesignRecord,
  type FlightProcessing,
  type SiteVector,
  type SourceAsset,
  type Survey,
} from "@/lib/api/orblodeSvc";
import { readPhotoExif } from "@/lib/mm/photoExif";
import { isPhoto, nameAll, stillToUpload, uploadPhotos, type PhotoProgress } from "@/lib/mm/photoUpload";
import { PRELIMINARY_CRS, UPLOAD_ROW } from "@/lib/status";
import { CRS_OPTIONS, TAG_SUGGESTIONS, VDATUM_OPTIONS, withCurrent } from "@/lib/upload/options";
import { createGraph, LAYER_NAMES, LAYERS, NOT_UPLOADED, viewerLayers, type CreateGraphInput, type Layer, type Upload } from "@/lib/upload/pipelineGraph";
import { uploadFiles, type AssetSlot } from "@/lib/upload/pipeline";
import {
  ACCEPT,
  ROLE_LABELS,
  SELECTABLE_ROLES,
  buildProcessorPlan,
  designFormat,
  guessRole,
  roleNeedsHeader,
  roleToAssetKind,
  settleRole,
  type FileRole,
  type PlannedSkip,
} from "@/lib/upload/planner";
import { putToSignedUrl, UploadTimeoutError } from "@/lib/upload/putToSignedUrl";
import { buildReviewRows, canProcess, fileWarnings, isInspecting, plannedFiles, reviewPatches, rowsMissingCrs, siteCrsFrom, type RowEdit } from "@/lib/upload/review";
import { DEFAULT_CHOICES, loadChoices, saveChoices, type SiteChoices } from "@/lib/upload/siteChoices";
import { quickRead } from "@/lib/upload/sniff";
import { uploadApi } from "@/lib/upload/uploadApi";
import { useCurrentWorkspace, useWorkspaceSites, useWorkspaces } from "@/lib/workspaces/store";
import { DataRow } from "./DataRow";
import { PipelineGraph } from "./PipelineGraph";
import { ReviewTable } from "./ReviewTable";

// v4: the upload became a stepper choosing between drone photos and files; the draft keeps that choice too.
const DRAFT_KEY = "orblode-upload-draft-v4";

const STEPS = ["Site", "Your data", "Settings", "Check", "Process"] as const;
const FILE_ROLES = SELECTABLE_ROLES.preprocessed;
const VECTOR_ACCEPT = ".dxf,.geojson,.json,.kml,.gpkg,.zip";
const DESIGN_ACCEPT = ACCEPT.design;
const EXIF_READERS = 6;

const PRESET_HINTS: Record<SiteChoices["preset"], string> = {
  fast: "Coarser and quicker: orthophoto and DEMs at 10 cm.",
  standard: "Orthophoto and DEMs at 5 cm.",
  high: "Orthophoto and DEMs at 2 cm, as far as the photos allow; the slowest.",
};

const LAYER_HINTS: Record<Layer, string> = {
  ortho: "The map image",
  dsm: "Surface heights, for 3D",
  dtm: "Bare ground, for volumes · always made",
  pointcloud: "3D tiles in the viewer",
};

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
  photogrammetry: boolean;
}

/** The uploaded files under review: which asset each is, and the role the queue gave it. */
interface ReviewTarget {
  surveyId: string;
  projectId: string;
  entries: { assetId: string; queuedRole: FileRole; roleByHand: boolean }[];
}

/** What the current run has already accomplished (ORB-38): each completed step is recorded here and skipped on a
 * retry, so a failure part-way neither duplicates the survey nor re-sends what landed. Bookkeeping, never rendered. */
interface RunProgress {
  /** Which survey this progress belongs to (see `runTarget`). */
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
  photogrammetry: boolean;
}

const emptyProgress = (target = ""): RunProgress => ({
  target,
  project: null,
  survey: null,
  assets: {},
  dispatched: {},
  designs: {},
  siteCrsDone: false,
  photogrammetry: false,
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

const queued = (file: File, role: FileRole): QueuedFile => ({ file, role, readingRole: false, roleByHand: true, fileCrs: null, progress: 0, status: "queued" });

/** An upload as the graph and the rows show it. */
function uploadOf(files: QueuedFile[]): Upload {
  if (files.length === 0) return NOT_UPLOADED;
  if (files.every((f) => f.status === "uploaded")) return { state: "done", label: formatBytes(files.reduce((s, f) => s + f.file.size, 0)) };
  if (files.some((f) => f.status === "uploading" || f.status === "uploaded")) {
    return { state: "uploading", percent: (100 * files.reduce((s, f) => s + (f.status === "uploaded" ? 1 : f.progress), 0)) / files.length };
  }
  return NOT_UPLOADED;
}

const rowFile = (q: QueuedFile) => ({
  name: q.file.name,
  size: formatBytes(q.file.size),
  done: q.status === "uploaded",
  percent: q.status === "uploading" ? q.progress * 100 : undefined,
});

/** The file someone picks with a button, through a hidden input. */
function PickFile({ label, accept, disabled, onFile }: { label: string; accept: string; disabled?: boolean; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

export function UploadScreen() {
  const router = useRouter();

  // Site
  const [chosenDestination, setDestination] = useState<"existing" | "new">("existing");
  const projects = useWorkspaceSites();
  const workspace = useCurrentWorkspace();
  // Without a workspace to ask, the server decides when the site is made.
  const mayCreateSite = workspace?.can_create_project ?? true;
  const destination = mayCreateSite ? chosenDestination : "existing";
  const [siteId, setSiteId] = useState("");
  const [linkedSite, setLinkedSite] = useState<string | null>(null);
  const [newSiteName, setNewSiteName] = useState("");
  const [datasetName, setDatasetName] = useState("");
  // Whether the user has typed their own dataset name (stops the autofill).
  const [datasetEdited, setDatasetEdited] = useState(false);
  const [surveyDate, setSurveyDate] = useState(todayISO());
  const [tags, setTags] = useState<string[]>([]);

  // What they have and want
  const [choices, setChoices] = useState<SiteChoices>(DEFAULT_CHOICES);
  const [remember, setRemember] = useState(false);
  const choose = (change: Partial<SiteChoices>) => setChoices((c) => ({ ...c, ...change }));
  const photosSource = choices.source === "photos";

  // Files
  const [files, setFiles] = useState<QueuedFile[]>([]);

  // The site's own data
  const [siteVectors, setSiteVectors] = useState<SiteVector[]>([]);
  const [designs, setDesigns] = useState<DesignRecord[]>([]);
  const [extraVector, setExtraVector] = useState<QueuedFile | null>(null);
  const [extraDesign, setExtraDesign] = useState<QueuedFile | null>(null);

  // Photos
  const [photos, setPhotos] = useState<MarkablePhoto[]>([]);
  const [reading, setReading] = useState(0);
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [photoProgress, setPhotoProgress] = useState<PhotoProgress | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [flight, setFlight] = useState<FlightProcessing | null>(null);
  const [gcpFile, setGcpFile] = useState<File | null>(null);
  const [gcpDatum, setGcpDatum] = useState("");
  const [gcpError, setGcpError] = useState<string | null>(null);
  const [gcpSaving, setGcpSaving] = useState(false);

  // Run
  const [step, setStep] = useState(0);
  const [working, setWorking] = useState(false);
  const [stepText, setStepText] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const progressRef = useRef<RunProgress>(emptyProgress());
  const [resume, setResume] = useState<{ target: string; text: string } | null>(null);
  const [watching, setWatching] = useState(false);
  // Once the survey exists, what it is made from is settled.
  const [surveyMade, setSurveyMade] = useState(false);

  // Review: the assets as last polled, what the person changed, and when they were checked.
  const [review, setReview] = useState<ReviewTarget | null>(null);
  const [reviewAssets, setReviewAssets] = useState<Record<string, SourceAsset>>({});
  const [reviewEdits, setReviewEdits] = useState<Record<string, RowEdit>>({});
  const [checkedAt, setCheckedAt] = useState(0);
  const [pollRound, setPollRound] = useState(0);
  const [skipWaiting, setSkipWaiting] = useState(false);
  const [redetecting, setRedetecting] = useState<ReadonlySet<string>>(new Set());

  // ?site=<id> preselects a site; ?new=1 opens the New-site path. URL and localStorage are only readable on the client,
  // and these mount setStates batch into one render, so the sync-setState lint is waived for this one effect.
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
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        if (!site && typeof d.siteId === "string") setSiteId(d.siteId);
        if (!site && d.destination === "new") setDestination("new");
        if (typeof d.newSiteName === "string") setNewSiteName(d.newSiteName);
        if (typeof d.datasetName === "string" && d.datasetName) {
          setDatasetName(d.datasetName);
          setDatasetEdited(true);
        }
        if (Array.isArray(d.tags)) setTags(d.tags.filter((t): t is string => typeof t === "string"));
        setDraftSaved(true);
      }
    } catch {
      // corrupted draft — ignore
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useSiteInWorkspace(siteId, setSiteId, linkedSite, false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ destination, siteId, newSiteName, datasetName: datasetEdited ? datasetName : "", tags }));
        setDraftSaved(true);
      } catch {
        // storage full/blocked — the dot just stays off
      }
    }, 600);
    return () => clearTimeout(t);
  }, [destination, siteId, newSiteName, datasetName, datasetEdited, tags]);

  // The site's vectors and designs, for "From <site>".
  const existingSite = destination === "existing" ? siteId : "";
  useEffect(() => {
    if (!existingSite) return;
    let live = true;
    listSiteVectors(existingSite).then(
      (v) => live && setSiteVectors(v),
      () => live && setSiteVectors([])
    );
    listDesigns(existingSite).then(
      ({ designs }) => live && setDesigns(designs),
      () => live && setDesigns([])
    );
    return () => {
      live = false;
    };
  }, [existingSite]);

  useEffect(() => {
    if (!photoUploading && !working) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [photoUploading, working]);

  const selectedProject = useMemo(() => projects.find((p) => p.id === siteId), [projects, siteId]);
  const siteName = destination === "new" ? newSiteName.trim() : (selectedProject?.name ?? "");
  const effectiveDatasetName = datasetEdited ? datasetName : siteName ? `${siteName} — ${formatDateHuman(surveyDate)}` : "";
  const siteCrs = selectedProject?.crs_epsg ? `EPSG:${selectedProject.crs_epsg}` : "";
  const siteVectorsShown = destination === "existing" ? siteVectors : [];
  const latestDesign = destination === "existing" ? (designs[0]?.name ?? null) : null;

  const runTarget = `${destination}|${siteId}|${newSiteName.trim()}|${choices.source}|${surveyDate}`;
  const resumeNotice = resume && resume.target === runTarget ? resume.text : null;

  const settle = useCallback((file: File, role: FileRole | null) => setFiles((prev) => settleRole(prev, file, role)), []);

  const addFiles = (list: File[]) => {
    setFiles((prev) => {
      const next = [...prev];
      for (const f of list) {
        if (next.some((q) => q.file.name === f.name)) continue;
        next.push({ file: f, role: guessRole(f.name, "preprocessed"), readingRole: roleNeedsHeader(f.name, "preprocessed"), roleByHand: false, fileCrs: null, progress: 0, status: "queued" });
      }
      return next;
    });
    for (const f of list) {
      void quickRead(f).then(({ role, crs }) => {
        settle(f, role);
        if (crs) setFiles((prev) => prev.map((q) => (q.file === f ? { ...q, fileCrs: crs } : q)));
      });
    }
  };

  const pickExtra = (kind: "vector" | "design", f: File) => {
    const q = queued(f, kind === "design" ? "design" : guessRole(f.name, "preprocessed"));
    (kind === "design" ? setExtraDesign : setExtraVector)(q);
    void quickRead(f).then(({ crs }) => crs && (kind === "design" ? setExtraDesign : setExtraVector)((cur) => (cur && cur.file === f ? { ...cur, fileCrs: crs } : cur)));
  };

  const addPhotos = async (dropped: File[]) => {
    const key = (f: File) => `${f.webkitRelativePath || f.name}:${f.size}:${f.lastModified}`;
    const have = new Set(photos.map((p) => key(p.file)));
    const named = nameAll(
      dropped.filter((f) => isPhoto(f.name) && !have.has(key(f))),
      photos.map((p) => p.name)
    );
    if (!named.length) return;
    setReading((r) => r + named.length);
    let next = 0;
    const read: MarkablePhoto[] = [];
    const flush = () => {
      const chunk = read.splice(0);
      if (chunk.length) setPhotos((list) => [...list, ...chunk]);
      setReading((r) => r - chunk.length);
    };
    await Promise.all(
      Array.from({ length: EXIF_READERS }, async () => {
        while (next < named.length) {
          const { file, name } = named[next++];
          read.push({ name, file, exif: await readPhotoExif(file) });
          if (read.length >= 25) flush();
        }
      })
    );
    flush();
  };

  const extras = [extraVector, extraDesign].filter((q): q is QueuedFile => !!q && (q.role === "design" ? choices.siteDesign : choices.siteVectors));
  const patchFile = (name: string, change: Partial<QueuedFile>) => {
    setFiles((prev) => prev.map((p) => (p.file.name === name ? { ...p, ...change } : p)));
    setExtraVector((q) => (q && q.file.name === name ? { ...q, ...change } : q));
    setExtraDesign((q) => (q && q.file.name === name ? { ...q, ...change } : q));
  };

  /** The site and survey this upload goes to, made once per run; a survey of only the site's own files goes to the
   * site's latest survey, as designs always have. */
  const ensureSurvey = async (progress: RunProgress): Promise<{ project: Project; survey: Survey }> => {
    let project = destination === "new" ? progress.project : (selectedProject ?? null);
    if (destination === "new" && !project) {
      setStepText("Creating site…");
      project = await createProject({
        workspace_id: workspace?.id,
        name: newSiteName.trim(),
        crs_epsg: Number(choices.fallbackCrs.replace("EPSG:", "")) || undefined,
        crs_label: CRS_OPTIONS.find((o) => o.value === choices.fallbackCrs)?.label,
        vertical_datum: choices.fallbackDatum || undefined,
      });
      progress.project = project;
      void useWorkspaces.getState().refresh();
    }
    if (!project) throw new Error("Select a site first");
    setSurveyMade(true);
    if (!progress.survey) {
      const metadata = {
        dataset_name: effectiveDatasetName.trim(),
        tags,
        source: "platform-upload",
        ...(choices.fallbackCrs ? { source_crs: choices.fallbackCrs } : {}),
        ...(choices.fallbackDatum ? { source_vertical_datum: choices.fallbackDatum } : {}),
        ...(choices.siteVectors ? {} : { site_vectors: false }),
      };
      if (!photosSource && files.length === 0) {
        setStepText("Resolving survey…");
        const { surveys } = await listSurveys(project.id);
        const latest = [...(surveys || [])].sort((a, b) => b.survey_date.localeCompare(a.survey_date))[0];
        progress.survey = latest ?? (await createSurvey({ project_id: project.id, survey_date: surveyDate, survey_type: "design", metadata }));
      } else {
        setStepText("Creating survey…");
        const type = photosSource ? "drone" : files.every((q) => q.role === "pointcloud") ? "lidar" : "preprocessed";
        progress.survey = await createSurvey({ project_id: project.id, survey_date: surveyDate, survey_type: type, metadata });
      }
    }
    return { project, survey: progress.survey };
  };

  const flightMethod = (): "gcp_file" | "rtk" | "gps" => (choices.gcpFile ? "gcp_file" : choices.rtk ? "rtk" : "gps");

  /** Keeps the flight's ground control as chosen while it can still change. */
  const syncFlight = async (surveyId: string, current: FlightProcessing | null) => {
    const method = flightMethod();
    if (current && current.method === method && current.heights === choices.heights) return current;
    const f = await beginPhotoFlight(surveyId, { method, heights: choices.heights });
    setFlight(f);
    return f;
  };

  const sendGcpFile = async (surveyId: string, file: File) => {
    setGcpSaving(true);
    setGcpError(null);
    try {
      setFlight(await saveGcpFile(surveyId, { name: file.name, text: await file.text(), heights_datum: gcpDatum || undefined }));
    } catch (err) {
      setGcpError(refusalMessage(err, "The GCP file couldn't be read."));
    } finally {
      setGcpSaving(false);
    }
  };

  const uploadExtras = async (surveyId: string, progress: RunProgress) => {
    if (extras.length === 0) return;
    await uploadFiles(uploadApi, {
      surveyId,
      files: extras.map((q) => ({ file: q.file, kind: roleToAssetKind(q.role), role: q.role })),
      slots: progress.assets,
      onStep: setStepText,
      onStatus: (name, status) => patchFile(name, { status, ...(status === "uploaded" ? { progress: 1 } : {}) }),
      onProgress: (name, frac) => patchFile(name, { progress: frac }),
    });
  };

  /** Starts the photos going up: the site and survey, the flight, every photo not in storage yet, then the GCP file
   * and the site's own files. A retry carries on from what landed. */
  const startPhotos = async () => {
    if (progressRef.current.target !== runTarget) progressRef.current = emptyProgress(runTarget);
    const progress = progressRef.current;
    setPhotoUploading(true);
    setResume(null);
    try {
      const { survey } = await ensureSurvey(progress);
      const f = await syncFlight(survey.id, flight);
      setStepText("");
      const have = (await surveyPhotos(survey.id)).uploaded ?? [];
      setUploadedPhotos(have);
      const todo = stillToUpload(photos, have);
      await uploadPhotos({ sign: async (batch) => (await signSurveyPhotos(survey.id, batch)).urls, put: putToSignedUrl }, todo, { onProgress: setPhotoProgress });
      setUploadedPhotos([...have, ...todo.map((p) => p.name)]);
      if (choices.gcpFile && gcpFile && !f.gcp_file) await sendGcpFile(survey.id, gcpFile);
      await uploadExtras(survey.id, progress);
    } catch (err) {
      toast.error(refusalMessage(err, "The upload stopped. Upload again to send what's still missing."));
      setResume({ target: runTarget, text: "The upload stopped. Upload again to send what's still missing." });
    } finally {
      setPhotoUploading(false);
      setStepText("");
    }
  };

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

  const poll = useDetectionPoll(loadDetections, step === 3 && review ? pollRound : null);

  const reviewRows = useMemo(() => {
    if (!review) return [];
    const entries = review.entries.flatMap((e) => {
      const asset = reviewAssets[e.assetId];
      return asset ? [{ asset, queuedRole: e.queuedRole, roleByHand: e.roleByHand }] : [];
    });
    return buildReviewRows(entries, reviewEdits, "preprocessed", checkedAt);
  }, [review, reviewAssets, reviewEdits, checkedAt]);
  const reviewComplete = !!review && reviewRows.length === review.entries.length;

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

  /** Uploads the files and the site's own, then opens the review while the server reads each one. Idempotent
   * (ORB-38): a retry resumes rather than re-creating the survey or its assets. */
  const runFiles = async () => {
    if (progressRef.current.target !== runTarget) {
      progressRef.current = emptyProgress(runTarget);
      setReview(null);
      setReviewAssets({});
      setReviewEdits({});
      setSkipWaiting(false);
    }
    const progress = progressRef.current;
    setWorking(true);
    setResume(null);
    setFiles((prev) => prev.map((p) => (p.status === "error" ? { ...p, status: "queued", progress: 0 } : p)));
    try {
      const { project, survey } = await ensureSurvey(progress);
      const all = [...files, ...extras];
      await uploadFiles(uploadApi, {
        surveyId: survey.id,
        files: all.map((q) => ({
          file: q.file,
          kind: roleToAssetKind(q.role),
          role: q.role,
          declaredCrs: choices.fallbackCrs || undefined,
          declaredVerticalDatum: choices.fallbackDatum || undefined,
        })),
        slots: progress.assets,
        onStep: setStepText,
        onStatus: (name, status) => patchFile(name, { status, ...(status === "uploaded" ? { progress: 1 } : {}) }),
        onProgress: (name, frac) => patchFile(name, { progress: frac }),
      });
      const entries = all.flatMap((q) => {
        const slot = progress.assets[q.file.name];
        return slot ? [{ assetId: slot.assetId, queuedRole: q.role, roleByHand: q.roleByHand }] : [];
      });
      const marked = Object.values(progress.assets).flatMap((slot) => (slot.asset ? [[slot.assetId, slot.asset] as const] : []));
      setReview({ surveyId: survey.id, projectId: project.id, entries });
      setReviewAssets((prev) => ({ ...Object.fromEntries(marked), ...prev }));
      setCheckedAt(Date.now());
      setPollRound((r) => r + 1);
      setStep(3);
    } catch (err) {
      const base = err instanceof Error ? err.message : "Upload failed";
      toast.error(err instanceof UploadTimeoutError ? `${base} — retry to resume from where it stopped.` : base);
      const done = Object.values(progress.assets).filter((a) => a.uploaded && a.marked).length;
      setResume(progress.survey ? { target: runTarget, text: `Survey already created — ${done} of ${plural(files.length + extras.length, "file")} uploaded. Retry resumes from there.` } : null);
    } finally {
      setWorking(false);
      setStepText("");
    }
  };

  /** Registers a new design revision of the site once, by its file. */
  const registerDesign = async (projectId: string, name: string, url: string, crs: string | undefined, progress: RunProgress, outcome: RunResult) => {
    const already = progress.designs[name];
    if (already) {
      outcome.designs.push(already);
      return;
    }
    setStepText(`Registering design ${name}…`);
    const d = await createDesign({ project_id: projectId, name, format: designFormat(name), file_url: url, source_crs: crs, metadata: { tags, source: "platform-upload" } });
    progress.designs[name] = d.name;
    outcome.designs.push(d.name);
  };

  const dispatch = async (surveyId: string, plan: ReturnType<typeof buildProcessorPlan>, progress: RunProgress, outcome: RunResult) => {
    for (const d of plan.dispatches) {
      const already = progress.dispatched[d.label];
      if (already) {
        outcome.workflows.push({ label: d.label, id: already });
        continue;
      }
      setStepText(`Dispatching ${d.label}…`);
      const res = await generateSurvey(surveyId, { ...d.request, version: "v1" });
      progress.dispatched[d.label] = res.workflow_id;
      outcome.workflows.push({ label: d.label, id: res.workflow_id });
    }
  };

  const finish = (outcome: RunResult, projectId: string) => {
    if (remember && projectId) saveChoices(projectId, choices);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // nothing to clear
    }
    progressRef.current = emptyProgress();
    setResult(outcome);
    setStep(4);
    setWatching(true);
  };

  /** Saves the review's changes, then dispatches each file in its own CRS and registers a design revision; a retry
   * re-sends nothing that already landed. */
  const processFiles = async () => {
    if (!review) return;
    const progress = progressRef.current;
    const rows = reviewRows;
    setWorking(true);
    try {
      for (const p of reviewPatches(rows, reviewEdits)) {
        setStepText(`Saving ${p.name}…`);
        const saved = await updateSurveyAsset(review.surveyId, p.assetId, p.patch);
        setReviewAssets((prev) => ({ ...prev, [p.assetId]: { ...prev[p.assetId], ...saved } }));
      }
      const outcome: RunResult = { surveyId: review.surveyId, workflows: [], designs: [], skips: [], warnings: fileWarnings(rows), siteCrs: null, photogrammetry: false };
      for (const row of rows.filter((r) => r.role === "design")) await registerDesign(review.projectId, row.name, row.asset.url, row.crs || undefined, progress, outcome);
      const siteNames = new Set(extraVector ? [extraVector.file.name] : []);
      const plan = buildProcessorPlan(
        plannedFiles(rows).map((f) => ({ ...f, siteWide: siteNames.has(f.name) })),
        { epsg: choices.fallbackCrs }
      );
      outcome.skips = plan.skips.map((s) => ({ ...s, reason: rows.find((r) => r.name === s.filename)?.skipReason ?? s.reason }));
      await dispatch(review.surveyId, plan, progress, outcome);
      if (progress.project && !progress.project.crs_epsg && !progress.siteCrsDone) {
        const site = siteCrsFrom(rows);
        if (site) {
          setStepText("Setting the site's CRS…");
          try {
            progress.project = await updateProject(progress.project.id, { crs_epsg: Number(site.epsg.replace(/^EPSG:/i, "")), crs_label: site.label });
            void useWorkspaces.getState().refresh();
            outcome.siteCrs = { label: site.label, error: null };
          } catch (err) {
            outcome.siteCrs = { label: site.label, error: refusalMessage(err, "the change was refused") };
          }
        }
        progress.siteCrsDone = true;
      }
      setReview(null);
      setReviewAssets({});
      setReviewEdits({});
      setSkipWaiting(false);
      finish(outcome, review.projectId);
    } catch (err) {
      toast.error(`${err instanceof Error ? err.message : "Processing couldn't start"} — retry to carry on from where it stopped.`);
    } finally {
      setWorking(false);
      setStepText("");
    }
  };

  /** Starts photogrammetry, then the site's own files' runs. */
  const processPhotos = async () => {
    const progress = progressRef.current;
    setWorking(true);
    try {
      const { project, survey } = await ensureSurvey(progress);
      await syncFlight(survey.id, flight);
      await uploadExtras(survey.id, progress);
      const outcome: RunResult = { surveyId: survey.id, workflows: [], designs: [], skips: [], warnings: [], siteCrs: null, photogrammetry: true };
      if (!progress.photogrammetry) {
        setStepText("Starting photogrammetry…");
        setFlight(
          await processSurveyPhotos(survey.id, {
            preset: choices.preset,
            layers: { dsm: choices.layers.dsm, orthophoto: choices.layers.ortho, pointcloud: choices.layers.pointcloud },
          })
        );
        progress.photogrammetry = true;
      }
      const slotOf = (q: QueuedFile) => progress.assets[q.file.name];
      const design = extras.find((q) => q.role === "design");
      if (design && slotOf(design)) await registerDesign(project.id, design.file.name, slotOf(design).url, design.fileCrs || siteCrs || undefined, progress, outcome);
      const vector = extras.find((q) => q.role !== "design");
      if (vector && slotOf(vector)) {
        const plan = buildProcessorPlan([{ name: vector.file.name, role: vector.role, url: slotOf(vector).url, crs: vector.fileCrs || undefined, siteWide: true }], { epsg: siteCrs });
        outcome.skips = plan.skips;
        await dispatch(survey.id, plan, progress, outcome);
      }
      finish(outcome, project.id);
    } catch (err) {
      toast.error(refusalMessage(err, "Processing couldn't start; retry to carry on."));
    } finally {
      setWorking(false);
      setStepText("");
    }
  };

  const reset = () => {
    setFiles([]);
    setPhotos([]);
    setUploadedPhotos([]);
    setPhotoProgress(null);
    setFlight(null);
    setGcpFile(null);
    setGcpError(null);
    setExtraVector(null);
    setExtraDesign(null);
    setResult(null);
    setWatching(false);
    setResume(null);
    progressRef.current = emptyProgress();
    setSurveyMade(false);
    setStep(0);
  };

  const leaveSite = () => {
    if (destination === "existing" && siteId) setChoices(loadChoices(siteId));
    setStep(1);
  };

  // What each step lets through.
  const allPhotosUp = photos.length > 0 && stillToUpload(photos, uploadedPhotos).length === 0;
  const siteReady = (destination === "existing" ? !!siteId : newSiteName.trim().length >= 2) && !!surveyDate && effectiveDatasetName.trim().length > 0;
  const filesReady = (files.length > 0 || extras.length > 0) && !files.some((q) => q.readingRole);
  const photosStarted = !!flight && (uploadedPhotos.length > 0 || photoUploading);
  const gcpReady = !choices.gcpFile || (!!flight?.gcp_file && !gcpError);
  const reviewReady = reviewComplete && canProcess(reviewRows, skipWaiting);

  const nextLabel = [
    "Continue",
    photosSource && !photosStarted ? "Upload the photos to continue" : "Continue",
    photosSource ? (allPhotosUp && !photoUploading ? "Check data" : "Waiting for uploads") : resumeNotice ? "Retry upload" : "Upload and check",
    photosSource || !reviewRows.some((r) => r.skipReason === null) ? (photosSource ? "Process" : "Finish") : `Process ${plural(reviewRows.filter((r) => r.skipReason === null).length, "file")}`,
  ][step];
  const nextEnabled = [
    siteReady,
    photosSource ? photosStarted && (!choices.gcpFile || !!gcpFile) : filesReady,
    photosSource ? allPhotosUp && !photoUploading : filesReady && !working,
    photosSource ? gcpReady && allPhotosUp && !gcpSaving : reviewReady,
  ][step];

  const goNext = () => {
    if (step === 0) leaveSite();
    else if (step === 1) setStep(2);
    else if (step === 2 && photosSource) setStep(3);
    else if (step === 2) void runFiles();
    else if (step === 3 && photosSource) void processPhotos();
    else if (step === 3) void processFiles();
  };

  const graphInput: CreateGraphInput = {
    source: choices.source,
    photos:
      photoUploading && photoProgress
        ? { state: "uploading", percent: photoProgress.fraction * 100 }
        : allPhotosUp
          ? { state: "done", label: `${photos.length} photos` }
          : NOT_UPLOADED,
    gcpFile: {
      on: choices.gcpFile,
      upload: gcpSaving ? { state: "uploading", percent: 50 } : flight?.gcp_file && gcpFile ? { state: "done", label: formatBytes(gcpFile.size) } : NOT_UPLOADED,
    },
    rtk: choices.rtk,
    preset: choices.preset,
    layers: photosSource
      ? choices.layers
      : { ortho: files.some((q) => q.role === "ortho"), dsm: files.some((q) => q.role === "dsm"), dtm: files.some((q) => q.role === "dtm"), pointcloud: files.some((q) => q.role === "pointcloud") },
    files: Object.fromEntries(LAYERS.map((l) => [l, uploadOf(files.filter((q) => q.role === l))])) as Record<Layer, Upload>,
    vectors: { on: choices.siteVectors, siteFiles: siteVectorsShown.length, upload: extraVector ? uploadOf([extraVector]) : null },
    design: { on: choices.siteDesign, current: latestDesign, upload: extraDesign ? uploadOf([extraDesign]) : null },
  };
  const layersShown = viewerLayers(graphInput);

  const sub = (i: number) =>
    [
      siteName || "Choose a site",
      photosSource ? (photos.length ? `${uploadedPhotos.length} of ${photos.length} uploaded` : "No photos yet") : files.length ? plural(files.length, "file") : "No files yet",
      photosSource ? "Photogrammetry, CRS" : "CRS and datum",
      "Read before processing",
      "Layers are built",
    ][i];

  const footerNote = working || photoUploading ? (
    <span className="flex items-center gap-2">
      <ProgressCircle value={null} size="sm" aria-label="Working" />
      {stepText || (photoUploading && photoProgress ? `Uploading ${photoProgress.done} of ${photoProgress.total} photos` : "Working…")}
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
      <PageHeader title="Upload survey data" subtitle="Start from drone photos or from files you already have; Orblode builds the pipeline around it" />
      <div className="flex flex-wrap items-start gap-6">
        <nav aria-label="Upload steps" className="w-full max-w-[232px] shrink-0">
          <ol className="flex flex-col">
            {STEPS.map((label, i) => {
              const passed = i < step;
              const current = i === step;
              const reachable = passed && step < 4 && !working && !photoUploading && !(i === 0 && surveyMade);
              return (
                <li key={label} className="py-1.5">
                  <button
                    type="button"
                    disabled={!reachable}
                    aria-current={current ? "step" : undefined}
                    onClick={() => setStep(i)}
                    className={`flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left ${current ? "bg-surface-3" : ""} ${reachable ? "hover:bg-surface-2" : ""}`}
                  >
                    <span
                      className={`flex size-[22px] shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium ${
                        passed ? "bg-ink-1 text-surface" : current ? "bg-surface text-ink-1 ring-[1.5px] ring-ink-1" : "bg-surface text-ink-3 ring-1 ring-hairline-strong"
                      }`}
                    >
                      {passed ? "✓" : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[13.5px] leading-[18px] ${current ? "font-semibold" : "font-medium"} ${current || passed ? "text-ink-1" : "text-ink-3"}`}>{label}</span>
                      <span className="caption block truncate text-ink-3">{sub(i)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <Card className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
          {step === 0 && (
            <section className="flex flex-col gap-4">
              <StepTitle title="Where does this survey go?" sub="Pick the site and the day the data was captured." />
              <SegmentedControl<"existing" | "new">
                aria-label="Destination"
                value={destination}
                onValueChange={setDestination}
                options={[{ value: "existing", label: "Existing site" }, ...(mayCreateSite ? [{ value: "new" as const, label: "New site" }] : [])]}
              />
              <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-3">
                {destination === "existing" ? (
                  <Field label="Site">
                    <SearchSelect
                      value={siteId || null}
                      onValueChange={setSiteId}
                      placeholder="Select a site…"
                      searchPlaceholder="Find a site"
                      options={projects.map((p) => ({ value: p.id, label: p.name, meta: p.location_name ?? undefined }))}
                      empty={(query) => (query ? `No site matches “${query}”.` : "No sites yet. Switch to New site to create one.")}
                    />
                  </Field>
                ) : (
                  <Field label="New site name" hint={workspace ? `It goes in the ${workspace.name} workspace.` : undefined}>
                    <Input value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} placeholder="e.g. Bandalkop pit" />
                  </Field>
                )}
                <Field label="Survey date">
                  <DateInput value={surveyDate} onChange={(v) => v && setSurveyDate(v)} />
                </Field>
              </div>
              <Field label="Dataset name">
                <Input
                  value={effectiveDatasetName}
                  onChange={(e) => {
                    setDatasetEdited(true);
                    setDatasetName(e.target.value);
                  }}
                  placeholder="Site — date"
                />
              </Field>
              <Field label="Tags">
                <TagInput tags={tags} onChange={setTags} suggestions={TAG_SUGGESTIONS} />
              </Field>
            </section>
          )}

          {step === 1 && (
            <section className="flex flex-col gap-5">
              <StepTitle title="What data do you have?" sub="Mark your data and upload it right here. Photos keep uploading while you fill in the settings." />
              <SourceCards value={choices.source} onChange={(source) => choose({ source })} disabled={surveyMade} />
              <div className="flex flex-wrap gap-5">
                <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
                  {photosSource ? (
                    <>
                      <Group title="This flight">
                        <DataRow
                          title="Drone photos"
                          description="JPEG or TIFF straight from the drone, GPS in the EXIF · needed for photogrammetry"
                          checked
                          fixed
                          action={
                            photos.length > 0 &&
                            !allPhotosUp && (
                              <Button variant="primary" size="sm" loading={photoUploading} disabled={reading > 0 || !siteReady} onClick={() => void startPhotos()}>
                                {uploadedPhotos.length ? `Upload ${stillToUpload(photos, uploadedPhotos).length} more` : "Upload"}
                              </Button>
                            )
                          }
                        >
                          <PhotosPicker
                            photos={photos}
                            reading={reading}
                            uploaded={uploadedPhotos}
                            progress={photoUploading ? photoProgress : null}
                            disabled={photoUploading}
                            onDrop={(list) => void addPhotos(list)}
                          />
                        </DataRow>
                        <DataRow
                          title="Ground control"
                          description="An ODM GCP file (gcp_list.txt): its CRS, then each target's position and where it is in the photos"
                          checked={choices.gcpFile}
                          onToggle={(gcpFile) => choose({ gcpFile })}
                          disabled={!!flight && flight.status !== "uploading" && flight.status !== "failed"}
                          action={
                            <PickFile
                              label={gcpFile ? "Replace" : "Choose file"}
                              accept=".txt,.csv"
                              disabled={gcpSaving}
                              onFile={(f) => {
                                setGcpFile(f);
                                setGcpError(null);
                                if (flight && uploadedPhotos.length > 0 && progressRef.current.survey) void sendGcpFile(progressRef.current.survey.id, f);
                              }}
                            />
                          }
                          files={gcpFile ? [{ name: gcpFile.name, size: formatBytes(gcpFile.size), done: !!flight?.gcp_file && !gcpError, percent: gcpSaving ? 50 : undefined }] : []}
                        >
                          {gcpError && <HelperText tone="error">{gcpError}</HelperText>}
                          {flight?.gcp_file && !gcpError && (
                            <HelperText tone="success">
                              {plural(flight.gcp_file.points.length, "GCP")} read, in EPSG:{flight.gcp_file.epsg}
                            </HelperText>
                          )}
                          {!flight && gcpFile && <p className="caption text-ink-3">It is read once the photos are signed for upload.</p>}
                        </DataRow>
                        {!choices.gcpFile && <GcpNote rtk={choices.rtk} onRtk={(rtk) => choose({ rtk })} />}
                      </Group>
                      <Group title="Layers to build" hint="Tick what you need. Photogrammetry only builds these, so fewer is faster.">
                        {LAYERS.map((l) => (
                          <DataRow
                            key={l}
                            title={LAYER_NAMES[l].replace("Terrain (", "").replace(")", "")}
                            description={LAYER_HINTS[l]}
                            checked={choices.layers[l]}
                            fixed={l === "dtm"}
                            onToggle={(v) => choose({ layers: { ...choices.layers, [l]: v } })}
                          />
                        ))}
                      </Group>
                    </>
                  ) : (
                    <Group title="Files you have" hint="Outputs from Pix4D, Metashape or DJI Terra, or a LiDAR scan. Each file is processed on its own.">
                      <Dropzone onFiles={addFiles} accept={ACCEPT.preprocessed} multiple disabled={working || !!review} title="Drag & drop files here, or browse" hint="GeoTIFF, LAS/LAZ, DXF, GeoJSON, KML or a zip" />
                      <FileList files={files} disabled={working || !!review} onRole={(name, role) => setFiles((prev) => prev.map((q) => (q.file.name === name ? { ...q, role, readingRole: false, roleByHand: true } : q)))} onRemove={(name) => setFiles((prev) => prev.filter((q) => q.file.name !== name))} />
                    </Group>
                  )}

                  <Group title={`From ${siteName || "the site"}`} hint="Kept on the site and used by every survey. A new revision updates the site, not just this survey.">
                    <DataRow
                      title="Show the site's vectors and contours"
                      description={
                        !choices.siteVectors
                          ? "Not used for this survey"
                          : siteVectorsShown.length
                            ? `${siteVectorsShown.slice(0, 3).map((v) => v.source_name).join(", ")}${siteVectorsShown.length > 3 ? "…" : ""} · ${plural(siteVectorsShown.length, "file")}`
                            : "None on the site yet; add one"
                      }
                      checked={choices.siteVectors}
                      onToggle={(siteVectors) => choose({ siteVectors })}
                      disabled={surveyMade}
                      action={<PickFile label="Add file" accept={VECTOR_ACCEPT} disabled={working || photoUploading} onFile={(f) => pickExtra("vector", f)} />}
                      files={extraVector ? [rowFile(extraVector)] : []}
                    />
                    <DataRow
                      title="Compare with the site's design"
                      description={!choices.siteDesign ? "Not used for this survey" : extraDesign ? `${extraDesign.file.name} · new revision` : (latestDesign ?? "No design on the site yet; add one")}
                      checked={choices.siteDesign}
                      onToggle={(siteDesign) => choose({ siteDesign })}
                      action={<PickFile label="New revision" accept={DESIGN_ACCEPT} disabled={working || photoUploading} onFile={(f) => pickExtra("design", f)} />}
                      files={extraDesign ? [rowFile(extraDesign)] : []}
                    />
                  </Group>
                  {siteName && destination === "existing" && <Checkbox checked={remember} onCheckedChange={setRemember} label={`Use these choices for ${siteName}'s next uploads`} />}
                </div>
                <div className="min-w-0 flex-[0_1_482px]">
                  <PipelineGraph graph={createGraph(graphInput)} label="Pipeline for this upload">
                    <p>{layersShown.length ? `Layers in the viewer: ${layersShown.join(" · ")}` : photosSource ? "Tick at least one layer for photogrammetry to build." : "Add the files you have."}</p>
                    {photosSource && <p className="mt-1 text-ink-3">Got a better DTM or point cloud later, say from LiDAR? Replace that layer from Edit survey once processing finishes.</p>}
                  </PipelineGraph>
                </div>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="flex flex-col gap-5">
              <StepTitle title="Settings for this pipeline" sub="Only the settings your data needs." />
              {photosSource && (
                <Group title="Photogrammetry">
                  <Field label="Quality" hint={PRESET_HINTS[choices.preset]}>
                    <SegmentedControl<SiteChoices["preset"]>
                      aria-label="Quality"
                      value={choices.preset}
                      onValueChange={(preset) => choose({ preset })}
                      options={[
                        { value: "fast", label: "Fast" },
                        { value: "standard", label: "Standard" },
                        { value: "high", label: "High" },
                      ]}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    {choices.gcpFile ? (
                      <Field label="Heights in the GCP file" hint="The vertical datum the layers are labelled with">
                        <Select value={gcpDatum} onValueChange={setGcpDatum} allLabel={selectedProject?.vertical_datum ? `The site's (${selectedProject.vertical_datum})` : "Not said"} options={VDATUM_OPTIONS} />
                      </Field>
                    ) : (
                      <Field label="Heights in the photos" hint="Ellipsoidal heights are moved onto EGM2008">
                        <Select
                          value={choices.heights}
                          onValueChange={(v) => choose({ heights: v as SiteChoices["heights"] })}
                          options={[
                            { value: "ellipsoidal", label: "Ellipsoidal (WGS84) · from the drone" },
                            { value: "msl", label: "Mean sea level (EGM2008)" },
                          ]}
                        />
                      </Field>
                    )}
                    <Field label="Ground control">
                      <p className="small pt-2 text-ink-2">{choices.gcpFile ? "From the uploaded GCP file" : choices.rtk ? "None · RTK/PPK photo positions" : "None · photo GPS only"}</p>
                    </Field>
                  </div>
                  <p className="font-mono text-xs text-ink-2">
                    Builds: {LAYERS.filter((l) => choices.layers[l]).map((l) => LAYER_NAMES[l]).join(", ") || "nothing yet"}
                  </p>
                </Group>
              )}
              <Group title="All layers">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Output CRS" hint={siteCrs ? "The site's; every layer is shown in it" : "A new site takes the one most of its files use"}>
                    <p className="small pt-2 text-ink-2">{siteCrs ? `Site CRS · ${CRS_OPTIONS.find((o) => o.value === siteCrs)?.label ?? siteCrs}` : "Set from the files"}</p>
                  </Field>
                  {!photosSource && (
                    <Field label="CRS for files that don't say" hint="Each file's own CRS comes first; you can change every file's in Check.">
                      <Select value={choices.fallbackCrs} onValueChange={(fallbackCrs) => choose({ fallbackCrs })} allLabel="None" options={withCurrent(CRS_OPTIONS, choices.fallbackCrs)} />
                    </Field>
                  )}
                  <Field label="Vertical datum for files that don't say">
                    <Select value={choices.fallbackDatum} onValueChange={(fallbackDatum) => choose({ fallbackDatum })} allLabel="None" options={VDATUM_OPTIONS} />
                  </Field>
                </div>
              </Group>
            </section>
          )}

          {step === 3 &&
            (photosSource ? (
              <section className="flex flex-col gap-4">
                <StepTitle title="Check your data" sub="Orblode read each upload before processing. Change anything that's wrong, or go back." />
                <CheckTable rows={photoChecks({ photos, flight, gcpOn: choices.gcpFile, gcpError, rtk: choices.rtk, heights: choices.heights, gcpDatum: gcpDatum || selectedProject?.vertical_datum || "" })} />
                <CheckTable rows={extraChecks(choices, siteVectorsShown.length, extraVector, latestDesign, extraDesign)} />
              </section>
            ) : (
              <section className="flex flex-col gap-4">
                <StepTitle
                  title={poll.polling ? "Reading your files" : "Check your files"}
                  sub="Orblode reads each file for what it is and the CRS it's in. Change anything that's wrong; your choices win over what was read."
                />
                {review && (
                  <ReviewTable
                    rows={reviewRows}
                    roles={[...FILE_ROLES, "design"]}
                    timedOut={poll.timedOut}
                    processing={working}
                    redetecting={redetecting}
                    onEdit={(assetId, change) => setReviewEdits((prev) => ({ ...prev, [assetId]: { ...prev[assetId], ...change } }))}
                    onDetectAgain={(id) => void detectAgain(id)}
                  />
                )}
                {rowsMissingCrs(reviewRows).length > 0 && <HelperText>Pick a CRS for {plural(rowsMissingCrs(reviewRows).length, "file")} to carry on.</HelperText>}
                {reviewRows.some((r) => r.inspecting) && !skipWaiting && (
                  <div>
                    <Button variant="ghost" size="sm" onClick={() => setSkipWaiting(true)}>
                      Skip waiting
                    </Button>
                  </div>
                )}
              </section>
            ))}

          {step === 4 && result && (
            <section className="flex flex-col gap-4">
              <StepTitle
                title="Processing dispatched"
                sub={
                  result.photogrammetry
                    ? "Photogrammetry runs first, then Orblode tiles the layers it built. The survey opens in the viewer once everything finishes."
                    : "Photogrammetry is skipped: your files go straight to processing. The survey opens in the viewer once they finish."
                }
              />
              {(result.workflows.length > 0 || result.photogrammetry) && <PushOffer />}
              <RunList result={result} layers={choices.layers} />
              {result.skips.length > 0 && (
                <HelperText tone="error">
                  Stored but not processed: {result.skips.map((s) => `${s.filename}: ${s.reason}`).join("; ")}
                </HelperText>
              )}
              {result.warnings.map((w) => (
                <HelperText key={w.filename}>
                  {w.filename}: {w.warnings.join(" · ")}
                </HelperText>
              ))}
              {result.siteCrs && <HelperText tone={result.siteCrs.error ? "error" : "success"}>{result.siteCrs.error ? `The new site has no CRS yet: setting it to ${result.siteCrs.label} failed: ${result.siteCrs.error}` : `The new site's CRS is now ${result.siteCrs.label}, the one most of its files use.`}</HelperText>}
              <div className="flex flex-wrap gap-3">
                {result.surveyId && (
                  <Button variant="primary" onClick={() => setWatching(true)}>
                    See progress
                  </Button>
                )}
                <Button variant="ghost" onClick={reset}>
                  Upload more
                </Button>
                <Button variant="quiet" onClick={() => router.push("/globe")}>
                  Back to dashboard
                </Button>
              </div>
            </section>
          )}

          {step < 4 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
              <span className="caption flex items-center gap-2 text-ink-3">
                <span className="font-mono">
                  Step {step + 1} of {STEPS.length}
                </span>
                {footerNote}
              </span>
              <span className="flex gap-2">
                <Button variant="quiet" disabled={working || (step === 1 && surveyMade)} onClick={() => (step === 0 ? router.push("/globe") : setStep(step - 1))}>
                  {step === 0 ? "Cancel" : "Back"}
                </Button>
                <Button variant="primary" disabled={!nextEnabled || working} loading={working} onClick={goNext}>
                  {nextLabel}
                </Button>
              </span>
            </div>
          )}
        </Card>
      </div>
      {watching && result?.surveyId && <ProcessingDialog surveyId={result.surveyId} open onClose={() => setWatching(false)} />}
    </Page>
  );
}

function StepTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="h2 mb-1">{title}</h2>
      <p className="small text-ink-3">{sub}</p>
    </div>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-[.08em] text-ink-3">{title}</h3>
      {hint && <p className="caption -mt-1 text-ink-3">{hint}</p>}
      {children}
    </div>
  );
}

function SourceCards({ value, onChange, disabled }: { value: "photos" | "files"; onChange: (v: "photos" | "files") => void; disabled?: boolean }) {
  const options = [
    { value: "photos" as const, title: "Drone photos", text: "Orblode runs photogrammetry and builds the layers you need." },
    { value: "files" as const, title: "Files you already have", text: "Outputs from Pix4D, Metashape, DJI Terra or a LiDAR scan. No photogrammetry." },
  ];
  return (
    <div role="radiogroup" aria-label="Survey layers come from" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled && !on}
            onClick={() => onChange(o.value)}
            className={`flex flex-col gap-1 rounded-lg bg-surface px-3.5 py-3 text-left disabled:opacity-60 ${on ? "border-[1.5px] border-ink-1" : "border border-hairline"}`}
          >
            <span className="flex items-center gap-2">
              <span className={`size-3.5 shrink-0 rounded-full ${on ? "border-[4.5px] border-ink-1" : "border-[1.5px] border-control"}`} />
              <span className="small font-medium text-ink-1">{o.title}</span>
            </span>
            <span className="caption pl-[22px] text-ink-3">{o.text}</span>
          </button>
        );
      })}
    </div>
  );
}

/** No ground control: the photos' GPS alone, unless the drone fixes its positions with RTK or PPK. */
function GcpNote({ rtk, onRtk }: { rtk: boolean; onRtk: (rtk: boolean) => void }) {
  return (
    <div
      role="note"
      className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-[13px] leading-[18px] ${
        rtk ? "tint-teal" : "tint-amber"
      }`}
    >
      {rtk ? (
        <p>
          <strong>RTK or PPK photos.</strong> Photo positions are good to a few centimetres, so ground control is optional. ODX is told to trust them.
        </p>
      ) : (
        <p>
          <strong>No ground control.</strong> Positions come from the drone&apos;s GPS, usually within a few metres. Fine for this survey&apos;s own distances, areas and
          stockpile volumes; not for comparing with other dates or the design.
        </p>
      )}
      <Checkbox checked={rtk} onCheckedChange={onRtk} label="My drone tags photos with RTK or PPK" />
    </div>
  );
}

function PhotosPicker({
  photos,
  reading,
  uploaded,
  progress,
  disabled,
  onDrop,
}: {
  photos: MarkablePhoto[];
  reading: number;
  uploaded: string[];
  progress: PhotoProgress | null;
  disabled?: boolean;
  onDrop: (files: File[]) => void;
}) {
  const folder = useRef<HTMLInputElement>(null);
  const size = photos.reduce((sum, p) => sum + p.file.size, 0);
  const located = photos.filter((p) => p.exif.lat !== undefined).length;
  const camera = photos.find((p) => p.exif.model)?.exif;
  const megapixels = camera?.width && camera.height ? Math.round((camera.width * camera.height) / 1e6) : null;
  const done = photos.length - stillToUpload(photos, uploaded).length;
  return (
    <div className="flex flex-col gap-2">
      <Dropzone onFiles={onDrop} multiple accept=".jpg,.jpeg,.tif,.tiff" disabled={disabled} title="Drop the drone's photos" hint="JPEG or TIFF, EXIF intact" />
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => folder.current?.click()}>
          Choose a folder
        </Button>
        <input
          ref={folder}
          type="file"
          multiple
          hidden
          {...{ webkitdirectory: "" }}
          onChange={(e) => {
            onDrop(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <span className="caption text-ink-3">DJI folders such as 100MEDIA keep their name, so repeated file names stay apart.</span>
      </div>
      {photos.length > 0 && (
        <>
          <span className="font-mono text-xs text-ink-2">
            {plural(photos.length, "photo")} · {formatBytes(size)} · GPS in {located} of {photos.length}
            {camera?.model ? ` · ${[camera.make, camera.model].filter(Boolean).join(" ")}` : ""}
            {megapixels ? ` · ${megapixels} MP` : ""}
            {reading ? ` · reading ${reading}` : ""}
          </span>
          <Progress
            value={progress ? Math.round(progress.fraction * 100) : Math.round((100 * done) / photos.length)}
            size="thin"
            label={progress ? `Uploading ${progress.done} of ${progress.total}` : `${done} of ${photos.length} uploaded`}
          />
        </>
      )}
    </div>
  );
}

function FileList({
  files,
  disabled,
  onRole,
  onRemove,
}: {
  files: QueuedFile[];
  disabled: boolean;
  onRole: (name: string, role: FileRole) => void;
  onRemove: (name: string) => void;
}) {
  if (files.length === 0) return null;
  return (
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
              onValueChange={(v) => onRole(q.file.name, v as FileRole)}
              disabled={disabled}
              options={FILE_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            />
            {!disabled ? (
              <IconButton icon={Cancel01Icon} aria-label={`Remove ${q.file.name}`} variant="bare" size="sm" onClick={() => onRemove(q.file.name)} />
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
          {(q.status === "uploading" || q.status === "uploaded") && <Progress value={Math.round(q.progress * 100)} size="thin" aria-label={`${q.file.name} upload`} className="mt-2" />}
        </li>
      ))}
    </ul>
  );
}

interface CheckRow {
  label: string;
  found: string;
  ok: boolean;
}

function photoChecks({
  photos,
  flight,
  gcpOn,
  gcpError,
  rtk,
  heights,
  gcpDatum,
}: {
  photos: MarkablePhoto[];
  flight: FlightProcessing | null;
  gcpOn: boolean;
  gcpError: string | null;
  rtk: boolean;
  heights: "ellipsoidal" | "msl";
  gcpDatum: string;
}): CheckRow[] {
  const located = photos.filter((p) => p.exif.lat !== undefined).length;
  const model = photos.find((p) => p.exif.model)?.exif.model;
  const rows: CheckRow[] = [
    { label: "Drone photos", found: `${plural(photos.length, "photo")} · GPS in ${located} of ${photos.length}${model ? ` · ${model}` : ""}`, ok: photos.length > 0 && located === photos.length },
  ];
  if (gcpOn) {
    const g = flight?.gcp_file;
    rows.push({
      label: "Ground control",
      found: gcpError ?? (g ? `GCP file read: ${plural(g.points.length, "point")} match the photos, in EPSG:${g.epsg}${g.warnings?.length ? ` · ${g.warnings.join(" · ")}` : ""}` : "The GCP file hasn't been read yet"),
      ok: !gcpError && !!g,
    });
    rows.push({ label: "Heights", found: gcpDatum ? `From the GCP file, in ${gcpDatum}` : "From the GCP file; their datum isn't said", ok: !!gcpDatum });
  } else {
    rows.push(
      rtk
        ? { label: "Ground control", found: "None · RTK/PPK photo positions, a few centimetres", ok: true }
        : { label: "Ground control", found: "None · positions from the drone's GPS, within a few metres", ok: false }
    );
    rows.push({ label: "Heights", found: heights === "ellipsoidal" ? "Ellipsoidal from the drone · moved onto EGM2008" : "Mean sea level, taken as EGM2008", ok: true });
  }
  return rows;
}

function extraChecks(choices: SiteChoices, siteFiles: number, vector: QueuedFile | null, design: string | null, newDesign: QueuedFile | null): CheckRow[] {
  const rows: CheckRow[] = [];
  if (choices.siteDesign && (design || newDesign)) rows.push({ label: "Design", found: newDesign ? `${newDesign.file.name}, uploaded now` : `${design} from the site`, ok: true });
  if (choices.siteVectors && (siteFiles || vector)) {
    rows.push({ label: "Vectors and contours", found: vector ? `${plural(siteFiles, "file")} from the site, 1 new` : `${plural(siteFiles, "file")} from the site`, ok: true });
  }
  return rows;
}

function CheckTable({ rows }: { rows: CheckRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Table minWidth={560}>
      <THead>
        <Tr>
          <Th>Data</Th>
          <Th>What Orblode found</Th>
          <Th>Status</Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((r) => (
          <Tr key={r.label}>
            <Td primary>{r.label}</Td>
            <Td>{r.found}</Td>
            <Td>
              {r.ok ? (
                <Chip tone="teal" glyph="check">
                  OK
                </Chip>
              ) : (
                <Chip tone="amber" glyph="triangle">
                  Check
                </Chip>
              )}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}

function RunList({ result, layers }: { result: RunResult; layers: Record<Layer, boolean> }) {
  const runs: { label: string; state: string }[] = [];
  if (result.photogrammetry) {
    runs.push({ label: "Photogrammetry (ODX)", state: "Starting" });
    for (const l of LAYERS) if (layers[l]) runs.push({ label: LAYER_NAMES[l], state: "Starts after photogrammetry" });
  }
  for (const w of result.workflows) runs.push({ label: w.label, state: "Starting" });
  for (const d of result.designs) runs.push({ label: `Design ${d}`, state: "Its surface is being built" });
  if (runs.length === 0) return <p className="small text-ink-3">Nothing needed processing.</p>;
  return (
    <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
      {runs.map((r) => (
        <li key={r.label} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="small min-w-0 truncate text-ink-1">{r.label}</span>
          <Chip tone={r.state === "Starting" ? "blue" : "neutral"} glyph={r.state === "Starting" ? "dot" : "circle-dashed"}>
            {r.state}
          </Chip>
        </li>
      ))}
    </ul>
  );
}
