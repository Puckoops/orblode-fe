import { apiFetch, ORBLODE_API } from "@/lib/api/client";
import { useWorkspaces } from "@/lib/workspaces/store";
import type { FlightProcessing, GenerateRequest, InitiatedUpload, PhotoExif, PhotoMark, PhotogrammetryPreset, SourceAsset, UploadInitFile } from "@/lib/api/orblodeSvc";

// The minor-minerals extension's API in orblode-svc, under /mm. Ids are opaque strings; *_at fields are
// epoch milliseconds unless they are ISO strings from PostGIS (masks and no-go places).

const BASE = ORBLODE_API;
const q = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
};
const id = (v: string) => encodeURIComponent(v);
// Lists cover the open workspace's sites unless they name one site.
const currentWorkspace = () => useWorkspaces.getState().currentId || undefined;
const scope = (projectId?: string) => (projectId ? { project_id: projectId } : { workspace_id: currentWorkspace() });

export interface Person {
  id: string;
  email: string;
}

export type GeoJSONGeometry = { type: string; coordinates: unknown };

export interface ChecklistItem {
  key: string;
  label: string;
  hint?: string;
  required: boolean;
  document_id?: string;
}

export interface LeaseBoundary {
  id: string;
  source_name: string;
  pillar_count: number;
  area_m2: number;
  area_diff_pct: number;
  area_agrees: boolean;
  set_at: number;
}

export interface LeaseStudy {
  proposed_m3?: number;
  water_table_depth_m?: number;
}

export type LeaseStatus = "draft" | "submitted" | "registered";
export type Workflow = "A" | "B" | "C" | "D";

export interface Lease {
  id: string;
  client_id: string;
  project_id: string;
  name: string;
  lease_no: string;
  loi_no: string;
  lessee: string;
  river: string;
  district: string;
  tahasil: string;
  mouza: string;
  mineral: string;
  workflow: Workflow;
  study_type: "pre_post" | "post_only";
  declared_area_ha: number;
  permitted_depth_m: number;
  valid_from: string;
  valid_to: string;
  remarks: string;
  status: LeaseStatus;
  boundary?: LeaseBoundary;
  /** What the lease's studies measure against; a study starts on its own once the proposed extraction is set. */
  study?: LeaseStudy;
  checklist: ChecklistItem[];
  submitted_at?: number;
  registered_at?: number;
  created_at: number;
  updated_at: number;
  created_by: Person;
}

export interface LeaseDocument {
  id: string;
  lease_id: string;
  kind: string;
  name: string;
  content_type: string;
  size: number;
  status: "pending_upload" | "uploaded";
  created_at: number;
  created_by: Person;
}

export interface LeaseDetail extends Lease {
  boundary_geometry?: GeoJSONGeometry;
  documents: LeaseDocument[] | null;
}

export type LeaseInput = Omit<
  Lease,
  "id" | "client_id" | "status" | "boundary" | "checklist" | "submitted_at" | "registered_at" | "created_at" | "updated_at" | "created_by"
>;

export interface Page<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

export function listLeases(projectId?: string): Promise<Lease[]> {
  return apiFetch<{ leases: Lease[] }>(BASE, `/mm/leases${q(scope(projectId))}`).then((r) => r.leases ?? []);
}

export function getLease(leaseId: string): Promise<LeaseDetail> {
  return apiFetch<LeaseDetail>(BASE, `/mm/leases/${id(leaseId)}`);
}

export function getSiteLease(projectId: string): Promise<LeaseDetail> {
  return apiFetch<LeaseDetail>(BASE, `/mm/projects/${id(projectId)}/lease`);
}

export function createLease(input: LeaseInput): Promise<LeaseDetail> {
  return apiFetch<LeaseDetail>(BASE, "/mm/leases", { method: "POST", body: input });
}

export function updateLease(leaseId: string, input: LeaseInput): Promise<LeaseDetail> {
  return apiFetch<LeaseDetail>(BASE, `/mm/leases/${id(leaseId)}`, { method: "PATCH", body: input });
}

export function setLeaseBoundary(leaseId: string, geometry: GeoJSONGeometry, sourceName: string, pillarCount: number): Promise<LeaseDetail> {
  return apiFetch<LeaseDetail>(BASE, `/mm/leases/${id(leaseId)}/boundary`, {
    method: "PUT",
    body: { geometry, source_name: sourceName, pillar_count: pillarCount },
  });
}

export function submitLease(leaseId: string): Promise<LeaseDetail> {
  return apiFetch<LeaseDetail>(BASE, `/mm/leases/${id(leaseId)}/submit`, { method: "POST" });
}

export function registerLease(leaseId: string): Promise<LeaseDetail> {
  return apiFetch<LeaseDetail>(BASE, `/mm/leases/${id(leaseId)}/register`, { method: "POST" });
}

export interface SignedUpload {
  id: string;
  upload_url: string;
}

/** Uploads a file to a signed URL the API answered; throws on a refused PUT. */
export async function putSigned(url: string, file: Blob, contentType: string): Promise<void> {
  const res = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

export async function uploadLeaseDocument(leaseId: string, kind: string, file: File): Promise<LeaseDocument> {
  const contentType = file.type || "application/octet-stream";
  const target = await apiFetch<SignedUpload>(BASE, `/mm/leases/${id(leaseId)}/documents/init`, {
    method: "POST",
    body: { kind, name: file.name, content_type: contentType },
  });
  await putSigned(target.upload_url, file, contentType);
  return apiFetch<LeaseDocument>(BASE, `/mm/documents/${id(target.id)}/uploaded`, { method: "PUT" });
}

export function documentLink(documentId: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(BASE, `/mm/documents/${id(documentId)}/link`);
}

export type MaskKind = "water" | "bank_strip" | "exclusion";

export interface Mask {
  id: string;
  project_id: string;
  survey_id?: string;
  kind: MaskKind;
  name: string;
  area_m2: number;
  geometry: GeoJSONGeometry;
  created_at: string;
}

export function listMasks(projectId: string, surveyId?: string): Promise<Mask[]> {
  return apiFetch<Mask[]>(BASE, `/mm/masks${q({ project_id: projectId, survey_id: surveyId })}`);
}

export function createMask(input: { project_id: string; survey_id?: string; kind: MaskKind; name: string; geometry: GeoJSONGeometry }): Promise<Mask> {
  return apiFetch<Mask>(BASE, "/mm/masks", { method: "POST", body: input });
}

export async function deleteMask(projectId: string, maskId: string): Promise<void> {
  await apiFetch<null>(BASE, `/mm/masks/${id(maskId)}${q({ project_id: projectId })}`, { method: "DELETE" });
}

export type NogoType = "bridge" | "water_intake" | "habitation" | "embankment" | "airspace_yellow" | "airspace_red" | "other";

export interface NogoFeature {
  id: string;
  project_id?: string;
  type: NogoType;
  name: string;
  keep_m: number;
  geometry: GeoJSONGeometry;
  created_at: string;
}

export interface NogoDistance {
  id: string;
  type: NogoType;
  name: string;
  keep_m: number;
  distance_m: number;
  geometry: GeoJSONGeometry;
}

export function listNogo(projectId: string): Promise<NogoFeature[]> {
  return apiFetch<NogoFeature[]>(BASE, `/mm/nogo${q({ project_id: projectId })}`);
}

export function createNogo(input: { project_id: string; type: NogoType; name: string; keep_m?: number; geometry: GeoJSONGeometry }): Promise<NogoFeature> {
  return apiFetch<NogoFeature>(BASE, "/mm/nogo", { method: "POST", body: input });
}

export async function deleteNogo(projectId: string, featureId: string): Promise<void> {
  await apiFetch<null>(BASE, `/mm/nogo/${id(featureId)}${q({ project_id: projectId })}`, { method: "DELETE" });
}

export type Season = "pre" | "post";

export interface AccuracyPoint {
  id: string;
  role: "gcp" | "check";
  dz?: number;
}

/** How far the survey's DTM sits from the mission's surveyed points; dz is DTM minus MSL height. */
export interface SurveyAccuracy {
  rmse_z_m?: number;
  mean_dz_m?: number;
  n: number;
  points: AccuracyPoint[];
  /** A mean offset too large to be noise, as a DTM in another height datum shows. */
  datum_suspect: boolean;
  checked_at: number;
}

export interface SurveyTag {
  id: string;
  project_id: string;
  survey_id: string;
  season: Season;
  season_label: string;
  mission_id?: string;
  /** Whether Orblode processed the flight's raw photos or the vendor uploaded processed files. */
  source?: FlightSource;
  accuracy?: SurveyAccuracy;
}

export function listSurveyTags(projectId?: string): Promise<SurveyTag[]> {
  return apiFetch<SurveyTag[]>(BASE, `/mm/survey-tags${q(scope(projectId))}`);
}

export function tagSurvey(surveyId: string, season: Season, seasonLabel: string): Promise<SurveyTag> {
  return apiFetch<SurveyTag>(BASE, "/mm/survey-tags", { method: "PUT", body: { survey_id: surveyId, season, season_label: seasonLabel } });
}

export interface Station {
  index: number;
  chainage_m: number;
  length_m: number;
  deposition_m2: number;
  erosion_m2: number;
  samples: number;
  line: string;
}

export interface RuleResults {
  max_extraction_pct: number;
  ratio_pct: number;
  ratio_ok: boolean;
  depth_cap_m: number;
  proposed_depth_m: number;
  depth_ok: boolean;
  recommended_m3: number;
  recommendation: string;
}

export type Verdict = "sustainable" | "reduce" | "no_deposition";

export interface Analysis {
  id: string;
  project_id: string;
  lease_id: string;
  pre_survey_id: string;
  post_survey_id: string;
  surface: "dtm" | "dsm";
  mask_ids: string[];
  inputs: {
    deadband_m: number;
    spacing_m: number;
    sample_step_m: number;
    centreline?: string;
    empirical_m3?: number;
    empirical_note?: string;
    proposed_m3: number;
    water_table_depth_m?: number;
    vertical_accuracy_m: number;
    /** measured: from both surveys' check points; assumed: the lease's study default. */
    accuracy_basis?: "measured" | "assumed";
    max_extraction_pct: number;
  };
  results: {
    lease_m2: number;
    effective_m2: number;
    masked_m2: number;
    dtm_diff: { cut_m3: number; fill_m3: number; net_m3: number; area_m2: number; sample_count: number };
    end_area: { stations: Station[]; deposition_m3: number; erosion_m3: number; net_m3: number };
    empirical_m3?: number;
    adopted_m3: number;
    coverage_pct?: number;
    uncertainty_m3: number;
    end_area_diff_pct?: number;
    empirical_diff_pct?: number;
  };
  rules: RuleResults;
  verdict: Verdict;
  warnings?: string[];
  /** queued and computing while the daemon measures it; draft once it can be accepted. */
  status: "queued" | "computing" | "failed" | "draft" | "accepted";
  progress?: { stage: string; percent: number; error?: string; started_at?: number; finished_at?: number };
  report_id?: string;
  created_at: number;
  created_by: Person;
}

export interface AnalysisInput {
  lease_id: string;
  pre_survey_id: string;
  post_survey_id: string;
  surface?: "dtm" | "dsm";
  mask_ids?: string[];
  centreline?: GeoJSONGeometry;
  spacing_m?: number;
  sample_step_m?: number;
  deadband_m?: number;
  empirical_m3?: number;
  empirical_note?: string;
  proposed_m3: number;
  water_table_depth_m?: number;
  vertical_accuracy_m?: number;
  max_extraction_pct?: number;
}

export function createAnalysis(input: AnalysisInput): Promise<Analysis> {
  return apiFetch<Analysis>(BASE, "/mm/analyses", { method: "POST", body: input });
}

export function listAnalyses(leaseId: string): Promise<Analysis[]> {
  return apiFetch<Analysis[]>(BASE, `/mm/leases/${id(leaseId)}/analyses`);
}

export function acceptAnalysis(analysisId: string): Promise<Report> {
  return apiFetch<Report>(BASE, `/mm/analyses/${id(analysisId)}/accept`, { method: "POST" });
}

/** Accepts a measured study and sends the report it drafts up the chain given, or the workspace's default chain. */
export function sendForVetting(analysisId: string, steps?: { label: string; reviewer_ids: string[] }[]): Promise<Report> {
  return apiFetch<Report>(BASE, `/mm/analyses/${id(analysisId)}/send-for-vetting`, { method: "POST", body: steps ? { steps } : {} });
}

/** A value left out keeps the stored one. */
export function setLeaseStudy(leaseId: string, study: LeaseStudy): Promise<Lease> {
  return apiFetch<Lease>(BASE, `/mm/leases/${id(leaseId)}/study`, { method: "PUT", body: study });
}

export type ReportStatus = "draft" | "in_review" | "returned" | "vetted" | "superseded";

export interface ReviewStep {
  label: string;
  reviewer_ids: string[];
  decision?: "approved" | "returned";
  comment?: string;
  decided_by?: Person;
  decided_at?: number;
}

export interface ReportFile {
  id: string;
  kind: string;
  name: string;
  content_type: string;
  size: number;
  sha256: string;
  created_at: number;
}

export interface Report {
  id: string;
  project_id: string;
  lease_id: string;
  analysis_id: string;
  version: number;
  previous_id?: string;
  title: string;
  status: ReportStatus;
  lease: Lease;
  analysis: Analysis;
  chain: ReviewStep[];
  current_step: number;
  files: ReportFile[];
  render: { status: "idle" | "queued" | "rendering" | "ready" | "failed"; error?: string; requested_at?: number; finished_at?: number };
  submitted_at?: number;
  submitted_by?: Person;
  vetted_at?: number;
  created_at: number;
  created_by: Person;
}

/** waiting: only reports in review whose current step lists the caller. */
export function listReports(
  params: { projectId?: string; leaseId?: string; status?: ReportStatus; waiting?: boolean } = {}
): Promise<Report[]> {
  return apiFetch<{ reports: Report[] }>(
    BASE,
    `/mm/reports${q({ ...scope(params.projectId), lease_id: params.leaseId, status: params.status, waiting: params.waiting ? "me" : undefined })}`
  ).then((r) => r.reports ?? []);
}

export function getReport(reportId: string): Promise<Report> {
  return apiFetch<Report>(BASE, `/mm/reports/${id(reportId)}`);
}

export function submitReport(reportId: string, steps: { label: string; reviewer_ids: string[] }[]): Promise<Report> {
  return apiFetch<Report>(BASE, `/mm/reports/${id(reportId)}/submit`, { method: "POST", body: { steps } });
}

export function decideReport(reportId: string, decision: "approved" | "returned", comment: string): Promise<Report> {
  return apiFetch<Report>(BASE, `/mm/reports/${id(reportId)}/decide`, { method: "POST", body: { decision, comment } });
}

export function renderReport(reportId: string): Promise<Report> {
  return apiFetch<Report>(BASE, `/mm/reports/${id(reportId)}/render`, { method: "POST" });
}

export function reviseReport(reportId: string): Promise<Report> {
  return apiFetch<Report>(BASE, `/mm/reports/${id(reportId)}/revisions`, { method: "POST" });
}

export function reportFileLink(reportId: string, fileId: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(BASE, `/mm/reports/${id(reportId)}/files/${id(fileId)}`);
}

export const summaryCsvUrl = () => `${BASE}/mm/reports/summary.csv${q(scope())}`;
export const CONTROL_POINTS_CSV_URL = (params: { projectId?: string; missionId?: string }) =>
  `${BASE}/mm/control-points.csv${q({ ...scope(params.projectId), mission_id: params.missionId })}`;

export interface Share {
  id: string;
  project_id: string;
  report_id: string;
  recipient: string;
  recipient_email?: string;
  access: "view" | "download";
  expires_at?: number;
  watermark: boolean;
  revoked: boolean;
  views: number;
  downloads: number;
  created_at: number;
  created_by: Person;
}

export interface ShareAccess {
  id: string;
  action: "view" | "download";
  file_id?: string;
  user_agent: string;
  at: number;
}

export interface ShareInput {
  recipient: string;
  recipient_email?: string;
  access: "view" | "download";
  expires_in_days: number;
  watermark: boolean;
}

export function createShare(reportId: string, input: ShareInput): Promise<{ share: Share; token: string; url: string }> {
  return apiFetch(BASE, `/mm/reports/${id(reportId)}/shares`, { method: "POST", body: input });
}

export function listShares(reportId: string): Promise<Share[]> {
  return apiFetch<Share[]>(BASE, `/mm/reports/${id(reportId)}/shares`);
}

export async function revokeShare(shareId: string): Promise<void> {
  await apiFetch<null>(BASE, `/mm/shares/${id(shareId)}`, { method: "DELETE" });
}

export function sharingLog(projectId?: string): Promise<{ share: Share; open: boolean; accesses: ShareAccess[] }[]> {
  return apiFetch(BASE, `/mm/sharing-log${q(scope(projectId))}`);
}

export interface LonLat {
  lon: number;
  lat: number;
}

export interface MissionSettings {
  camera: string;
  altitude_m: number;
  front_overlap: number;
  side_overlap: number;
  speed_ms: number;
  direction: "along" | "across";
  pattern: "single" | "double";
  buffer_m: number;
  safety_zone_m: number;
  control_method: ControlMethod;
  /** The height datum an RTK or PPK drone writes in its photos. */
  photo_heights?: "ellipsoidal" | "msl";
  line_azimuth_deg: number;
}

/** How a flight is tied to the ground: targets and smart GCPs are marked by hand in the photos, coded targets are
 * found automatically, and an RTK or PPK drone's own positions are used with every point kept as a check. */
export type ControlMethod = "targets" | "smart" | "coded" | "rtk";

export const marksPhotos = (method: ControlMethod | undefined) => !method || method === "targets" || method === "smart";

export interface GCP {
  id: string;
  role: "gcp" | "check";
  where: string;
  auto: LonLat;
  final: LonLat;
  moved_m: number;
  bearing?: string;
  reason?: string;
  approval?: "" | "pending" | "approved";
  approver?: Person;
  /** The coded target laid on the point, for missions using coded targets. */
  marker_id?: number;
}

export interface Check {
  key: string;
  label: string;
  state: "ok" | "warn" | "no";
  detail: string;
}

export type MissionStatus = "draft" | "returned" | "issued" | "accepted" | "flown" | "received";

export interface Mission {
  id: string;
  project_id: string;
  lease_id: string;
  code: string;
  workflow: Workflow;
  season: Season;
  settings: MissionSettings;
  gcps: GCP[];
  checks: Check[];
  stats: { area_ha: number; gsd_cm: number; lines: number; photos: number; minutes: number; batteries: number; line_m: number; trigger_m: number };
  vendor_id?: string;
  drone_id?: string;
  window?: string;
  flight_from?: string;
  status: MissionStatus;
  return_note?: string;
  baseline_id?: string;
  survey_ids: string[];
  /** The DGPS job made when it was issued, when its workspace has a reference station. */
  gnss_job_id?: string;
  issued_at?: number;
  issued_by?: Person;
  created_at: number;
  updated_at: number;
  created_by: Person;
}

export interface MissionEvent {
  id: string;
  kind: string;
  point_id?: string;
  text: string;
  by: Person;
  at: number;
}

export interface MissionGeometry {
  lease: GeoJSONGeometry;
  buffer: GeoJSONGeometry;
  safety: GeoJSONGeometry;
  nogo: NogoDistance[];
  lines: [LonLat, LonLat][];
}

export const MOVE_REASONS = [
  "Standing water or wet sand",
  "Soft or shifting sand",
  "Obstruction: tree, structure or stockpile",
  "Poor sky view for DGPS",
  "No safe access",
  "Reuse an existing pillar or mark",
  "Other (note on field sheet)",
];

export const CAMERAS: Record<string, string> = { "1in_20mp": "1-inch 20 MP · 8.8 mm", "43_20mp": "4/3 20 MP · 12.3 mm" };

export function listMissions(params: { projectId?: string; leaseId?: string; status?: MissionStatus } = {}): Promise<Mission[]> {
  return apiFetch<{ missions: Mission[] }>(BASE, `/mm/missions${q({ ...scope(params.projectId), lease_id: params.leaseId, status: params.status })}`).then(
    (r) => r.missions ?? []
  );
}

export function myMissions(): Promise<Mission[]> {
  return apiFetch<Mission[]>(BASE, `/mm/missions/mine${q({ workspace_id: currentWorkspace() })}`);
}

export function getMission(missionId: string): Promise<Mission> {
  return apiFetch<Mission>(BASE, `/mm/missions/${id(missionId)}`);
}

export function createMission(input: { lease_id: string; season: Season; workflow?: Workflow; baseline_id?: string }): Promise<Mission> {
  return apiFetch<Mission>(BASE, "/mm/missions", { method: "POST", body: input });
}

export function updateMission(
  missionId: string,
  change: { settings?: MissionSettings; vendor_id?: string; drone_id?: string; window?: string; flight_from?: string }
): Promise<Mission> {
  return apiFetch<Mission>(BASE, `/mm/missions/${id(missionId)}`, { method: "PATCH", body: change });
}

export function missionEvents(missionId: string): Promise<MissionEvent[]> {
  return apiFetch<MissionEvent[]>(BASE, `/mm/missions/${id(missionId)}/events`);
}

export function missionGeometry(missionId: string): Promise<MissionGeometry> {
  return apiFetch<MissionGeometry>(BASE, `/mm/missions/${id(missionId)}/geometry`);
}

export function moveGCP(missionId: string, pointId: string, to: LonLat, reason: string): Promise<Mission> {
  return apiFetch<Mission>(BASE, `/mm/missions/${id(missionId)}/gcps/${id(pointId)}/move`, { method: "POST", body: { ...to, reason } });
}

export function approveMove(missionId: string, pointId: string): Promise<Mission> {
  return apiFetch<Mission>(BASE, `/mm/missions/${id(missionId)}/gcps/${id(pointId)}/approve`, { method: "POST" });
}

export function resetGCP(missionId: string, pointId: string): Promise<Mission> {
  return apiFetch<Mission>(BASE, `/mm/missions/${id(missionId)}/gcps/${id(pointId)}/reset`, { method: "POST" });
}

/** Makes an issued mission's DGPS job from its points and the workspace's reference station. */
export function missionGroundControl(missionId: string): Promise<Mission> {
  return apiFetch<Mission>(BASE, `/mm/missions/${id(missionId)}/ground-control`, { method: "POST" });
}

export function issueMission(missionId: string): Promise<Mission> {
  return apiFetch<Mission>(BASE, `/mm/missions/${id(missionId)}/issue`, { method: "POST" });
}

export function acceptMission(missionId: string): Promise<Mission> {
  return apiFetch<Mission>(BASE, `/mm/missions/${id(missionId)}/accept`, { method: "POST" });
}

export function markFlown(missionId: string): Promise<Mission> {
  return apiFetch<Mission>(BASE, `/mm/missions/${id(missionId)}/flown`, { method: "POST" });
}

export function returnMission(missionId: string, note: string): Promise<Mission> {
  return apiFetch<Mission>(BASE, `/mm/missions/${id(missionId)}/return`, { method: "POST", body: { note } });
}

export type FlightSource = "photos" | "processed";

/** Starts a flight of an issued mission: a new survey of the site, tagged with the mission's season. Processed files
 * get their upload slots; raw photos get a flight record and go up through photoUploads. */
export function createFlight(
  missionId: string,
  input: { survey_date: string; season_label: string; source?: FlightSource; files?: UploadInitFile[] }
): Promise<{ survey_id: string; uploads?: { uploads: InitiatedUpload[] }; processing?: FlightProcessing }> {
  return apiFetch(BASE, `/mm/missions/${id(missionId)}/flights`, { method: "POST", body: input });
}

export type { FlightMethod, FlightOptions, FlightProcessing, FlightStatus, PhotoExif, PhotoMark, PhotogrammetryPreset } from "./orblodeSvc";

/** Signs uploads for at most 500 of the flight's photos, and records what the browser read from them. */
export function photoUploads(
  missionId: string,
  surveyId: string,
  photos: { name: string; size: number; exif: PhotoExif }[]
): Promise<{ urls: Record<string, string>; count: number; bytes: number }> {
  return apiFetch(BASE, `/mm/missions/${id(missionId)}/flights/${id(surveyId)}/photos/uploads`, { method: "POST", body: { photos } });
}

/** The photos storage has, for resuming an upload. */
export function flightPhotos(missionId: string, surveyId: string): Promise<{ uploaded: string[] | null; count: number; bytes: number; expected: number }> {
  return apiFetch(BASE, `/mm/missions/${id(missionId)}/flights/${id(surveyId)}/photos`);
}

export function saveMarks(missionId: string, surveyId: string, marks: PhotoMark[]): Promise<FlightProcessing> {
  return apiFetch<FlightProcessing>(BASE, `/mm/missions/${id(missionId)}/flights/${id(surveyId)}/marks`, { method: "PUT", body: { marks } });
}

export function getFlightProcessing(missionId: string, surveyId: string): Promise<FlightProcessing> {
  return apiFetch<FlightProcessing>(BASE, `/mm/missions/${id(missionId)}/flights/${id(surveyId)}/processing`);
}

/** Starts photogrammetry; the DTM is always made. Refused with the reasons while photos, DGPS or marks are missing. */
export function processFlight(
  missionId: string,
  surveyId: string,
  input: { preset: PhotogrammetryPreset; layers: { dsm: boolean; orthophoto: boolean; pointcloud: boolean } }
): Promise<FlightProcessing> {
  return apiFetch<FlightProcessing>(BASE, `/mm/missions/${id(missionId)}/flights/${id(surveyId)}/process`, { method: "POST", body: input });
}

export function flightUploaded(missionId: string, surveyId: string, assetId: string): Promise<SourceAsset> {
  return apiFetch<SourceAsset>(BASE, `/mm/missions/${id(missionId)}/flights/${id(surveyId)}/assets/${id(assetId)}/uploaded`, { method: "PUT" });
}

export function generateFlight(missionId: string, surveyId: string, request: GenerateRequest): Promise<{ workflow_id: string }> {
  return apiFetch(BASE, `/mm/missions/${id(missionId)}/flights/${id(surveyId)}/generate`, { method: "POST", body: request });
}

export interface Vendor {
  id: string;
  workspace_id?: string;
  name: string;
  contact: string;
  user_ids: string[];
  /** The organisation's team whose members fly for the vendor. */
  team_id?: string;
}

export interface Drone {
  id: string;
  vendor_id: string;
  model: string;
  camera: string;
  uin: string;
  insurance_valid_to: string;
  pilot: string;
  rpc_valid_to: string;
}

export function listVendors(): Promise<Vendor[]> {
  return apiFetch<Vendor[]>(BASE, `/mm/vendors${q({ workspace_id: currentWorkspace() })}`);
}

/** A vendor joins the open workspace's register and stays in it. */
export function saveVendor(vendor: Omit<Vendor, "id" | "workspace_id">, vendorId?: string): Promise<Vendor> {
  return apiFetch<Vendor>(BASE, vendorId ? `/mm/vendors/${id(vendorId)}` : "/mm/vendors", {
    method: vendorId ? "PATCH" : "POST",
    body: { ...vendor, workspace_id: currentWorkspace() },
  });
}

export function listDrones(vendorId?: string): Promise<Drone[]> {
  return apiFetch<Drone[]>(BASE, `/mm/drones${q({ vendor_id: vendorId, workspace_id: currentWorkspace() })}`);
}

export function saveDrone(drone: Omit<Drone, "id">, droneId?: string): Promise<Drone> {
  return apiFetch<Drone>(BASE, droneId ? `/mm/drones/${id(droneId)}` : "/mm/drones", { method: droneId ? "PATCH" : "POST", body: drone });
}

export interface GnssFile {
  id: string;
  name: string;
  size: number;
  uploaded: boolean;
}

export interface GnssSession {
  point_id: string;
  role: string;
  files: GnssFile[];
  antenna_height_m: number;
  antenna_model?: string;
  gcp_id?: string;
}

export interface GnssJob {
  id: string;
  project_id: string;
  mission_id?: string;
  code: string;
  reference: { kind: "cors" | "control_point"; name: string; files: GnssFile[]; lat: number; lon: number; h_ellipsoid: number; antenna_height_m: number; control_point_id?: string };
  base?: GnssSession;
  rovers: GnssSession[];
  elevation_mask_deg: number;
  geoid: "egm2008" | "none";
  status: "draft" | "queued" | "completed" | "failed";
  error?: string;
  engine?: string;
  warnings?: string[];
  created_at: number;
  created_by: Person;
}

export interface ControlPoint {
  id: string;
  project_id: string;
  mission_id?: string;
  job_id: string;
  point_id: string;
  role: string;
  lat: number;
  lon: number;
  h_ellipsoid: number;
  h_msl?: number;
  easting: number;
  northing: number;
  utm_epsg: number;
  sigma_h_m: number;
  sigma_v_m: number;
  solution: "fixed" | "float" | "single";
  fix_ratio: number;
  epochs: number;
  duration_s: number;
  baseline_m: number;
  reference: string;
  issued_offset_m?: number;
}

export interface GnssJobInput {
  project_id: string;
  mission_id?: string;
  reference: { kind: "cors" | "control_point"; name: string; lat: number; lon: number; h_ellipsoid: number; antenna_height_m: number; control_point_id?: string };
  base?: { point_id: string; antenna_height_m: number; antenna_model?: string };
  rovers: { point_id: string; role: "gcp" | "check"; antenna_height_m: number; antenna_model?: string; gcp_id?: string }[];
  elevation_mask_deg: number;
  geoid: "egm2008" | "none";
}

export function listGnssJobs(projectId?: string): Promise<GnssJob[]> {
  return apiFetch<GnssJob[]>(BASE, `/mm/gnss/jobs${q(scope(projectId))}`);
}

export function createGnssJob(input: GnssJobInput): Promise<GnssJob> {
  return apiFetch<GnssJob>(BASE, `/mm/gnss/jobs${q({ project_id: input.project_id })}`, { method: "POST", body: input });
}

export async function uploadGnssFiles(jobId: string, target: string, files: File[]): Promise<GnssJob> {
  const targets = await apiFetch<SignedUpload[]>(BASE, `/mm/gnss/jobs/${id(jobId)}/files/init`, {
    method: "POST",
    body: { target, files: files.map((f) => ({ name: f.name, size: f.size, content_type: "application/octet-stream" })) },
  });
  let job: GnssJob | null = null;
  for (let i = 0; i < files.length; i++) {
    await putSigned(targets[i].upload_url, files[i], "application/octet-stream");
    job = await apiFetch<GnssJob>(BASE, `/mm/gnss/jobs/${id(jobId)}/files/${id(targets[i].id)}/uploaded`, { method: "PUT" });
  }
  return job as GnssJob;
}

export function runGnssJob(jobId: string): Promise<GnssJob> {
  return apiFetch<GnssJob>(BASE, `/mm/gnss/jobs/${id(jobId)}/run`, { method: "POST" });
}

export function listControlPoints(params: { projectId?: string; missionId?: string } = {}): Promise<ControlPoint[]> {
  return apiFetch<ControlPoint[]>(BASE, `/mm/control-points${q({ ...scope(params.projectId), mission_id: params.missionId })}`);
}

export interface RegisterRow {
  lease: Lease;
  stages: { key: string; label: string; state: "done" | "current" | "waiting" }[];
  current_stage: string;
  state: string;
  state_label: string;
}

export function getRegister(projectId?: string): Promise<RegisterRow[]> {
  return apiFetch<RegisterRow[]>(BASE, `/mm/register${q(scope(projectId))}`);
}

export interface Overview {
  leases: number;
  sites: number;
  gnss_jobs: number;
  gnss_running: number;
  gnss_float: number;
  missions: number;
  missions_open: number;
  reports: number;
  reports_vetted: number;
  reports_in_review: number;
  replenished_m3: number;
  attention: { lease_id: string; lease_name: string; item: string; where: string; link: string; tone: "info" | "warn" | "bad"; label: string }[];
  activity: { at: number; text: string; link?: string }[];
  stages: Record<string, number>;
}

export function getOverview(): Promise<Overview> {
  return apiFetch<Overview>(BASE, `/mm/overview${q(scope())}`);
}

/** What a shared link shows, read without a session through /api/public/mm. */
export interface PublicShare {
  title: string;
  lease_name: string;
  river: string;
  district: string;
  version: number;
  vetted_at: number;
  sha256: string;
  recipient: string;
  access: "view" | "download";
  expires_at?: number;
  superseded: boolean;
  pending: boolean;
  summary: { area_ha: number; replenished_m3: number; proposed_m3: number; ratio_pct: number; recommendation: string; verdict: Verdict };
  files: { id: string; kind: string; name: string; size: number; content_type: string }[];
}

export const PUBLIC_API = "/api/public/mm";

/** Who can vet reports on the site, for naming a chain before a report exists. */
export function siteReviewers(projectId: string): Promise<string[]> {
  return apiFetch<{ user_ids: string[] }>(BASE, `/mm/projects/${id(projectId)}/reviewers`).then((r) => r.user_ids ?? []);
}

export function reportReviewers(reportId: string): Promise<string[]> {
  return apiFetch<{ user_ids: string[] | null }>(BASE, `/mm/reports/${id(reportId)}/reviewers`).then((r) => r.user_ids ?? []);
}

/** A minor-minerals workspace's defaults: the review chain reports are sent along, the station ground control is
 * solved against, and how studies measure. */
export interface WorkspaceSettings {
  workspace_id: string;
  review_chain: { label: string; reviewer_ids: string[] }[];
  reference_station: ReferenceStation | null;
  study_defaults: { spacing_m: number; vertical_accuracy_m: number; max_extraction_pct: number };
  updated_at?: number;
  updated_by?: Person;
}

export interface ReferenceStation {
  name: string;
  lat: number;
  lon: number;
  h_ellipsoid: number;
  antenna_height_m: number;
}

export function getSettings(workspaceId = currentWorkspace()): Promise<WorkspaceSettings> {
  return apiFetch<WorkspaceSettings>(BASE, `/mm/settings${q({ workspace_id: workspaceId })}`);
}

export function saveSettings(
  settings: Omit<WorkspaceSettings, "workspace_id" | "updated_at" | "updated_by">,
  workspaceId = currentWorkspace()
): Promise<WorkspaceSettings> {
  return apiFetch<WorkspaceSettings>(BASE, `/mm/settings${q({ workspace_id: workspaceId })}`, { method: "PUT", body: settings });
}
