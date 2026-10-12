import { apiFetch, ORBLODE_API } from "@/lib/api/client";
import { fetchAllPages } from "@/lib/api/paging";
import type { EpochMs } from "@/lib/time";

// orblode-svc, through /api/orblode: surveys, render manifest, measurements, folders. Shapes follow
// ORBLODE_API_CONTRACT.md: entity ids are opaque strings (ObjectIDs; client_id/project_id are
// user-svc UUIDs), every *_at is epoch milliseconds, and list routes are paged.

const BASE = ORBLODE_API;

/** Set by the server from the token; never sent by the client. */
export interface Author {
  id: string;
  email: string;
}

interface PageEnvelope {
  total: number;
  page: number;
  page_size: number;
  [plural: string]: unknown;
}

/** Every row of a paged list route (`data: {<plural>, total, page, page_size}`). */
function listAll<T>(path: string, plural: string): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  return fetchAllPages<T>(async (page, pageSize) => {
    const res = await apiFetch<PageEnvelope>(BASE, `${path}${sep}page=${page}&page_size=${pageSize}`);
    return { items: res[plural] as T[] | null | undefined, total: res.total };
  });
}

/** Minimal GeoJSON geometry (Polygon / LineString / …). */
export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export interface Survey {
  id: string;
  client_id: string;
  project_id: string;
  survey_date: string;
  survey_type: string;
  status: string;
  version_number?: number;
  working_crs: string;
  vertical_datum: string;
  metadata: Record<string, unknown> | null;
  created_at: EpochMs;
  updated_at: EpochMs;
  created_by?: Author;
  edited_by?: Author;
}

export async function listSurveys(projectId: string): Promise<{ surveys: Survey[] }> {
  return { surveys: await listAll<Survey>(`/surveys?project_id=${encodeURIComponent(projectId)}`, "surveys") };
}

/** Body for POST /surveys — working CRS / vertical datum are NOT client-supplied;
 * orblode-svc snapshots them from the project. */
export interface CreateSurveyRequest {
  project_id: string;
  survey_date: string; // YYYY-MM-DD
  survey_type?: string;
  metadata?: Record<string, unknown>;
}

export function createSurvey(req: CreateSurveyRequest): Promise<Survey> {
  return apiFetch<Survey>(BASE, "/surveys", { method: "POST", body: req });
}

export function getSurvey(surveyId: string): Promise<Survey> {
  return apiFetch<Survey>(BASE, `/surveys/${surveyId}`);
}

/** PATCH body. `expected_updated_at` is the `updated_at` last read: a mismatch, or a status that
 * is no longer editable, answers 409. `dataset_name` and `tags` merge into `metadata`. */
export interface UpdateSurveyRequest {
  survey_date?: string; // YYYY-MM-DD
  survey_type?: string;
  dataset_name?: string;
  tags?: string[];
  expected_updated_at: EpochMs;
}

/** A new `survey_date` re-orders the site's surveys, re-matches stockpiles and marks the affected
 * volumes stale. */
export function updateSurvey(surveyId: string, body: UpdateSurveyRequest): Promise<Survey> {
  return apiFetch<Survey>(BASE, `/surveys/${surveyId}`, { method: "PATCH", body });
}

export function updateSurveyStatus(surveyId: string, status: string): Promise<Survey> {
  return apiFetch<Survey>(BASE, `/surveys/${surveyId}/status`, { method: "PUT", body: { status } });
}

/** One requested upload slot. `kind` is one of the ingest kinds the planner
 * produces: terrain | ortho | pointcloud | vector | site_model. `replaces`
 * names the asset this upload supersedes once it is marked uploaded. */
export interface UploadInitFile {
  filename: string;
  kind: string;
  role?: string;
  content_type?: string;
  crs?: string;
  replaces?: string;
}

/** A registered (or pending) source object on a survey. */
export interface SourceAsset {
  id: string;
  client_id: string;
  survey_id: string;
  kind: string;
  role?: string;
  url: string;
  filename?: string;
  size_bytes?: number;
  crs?: string;
  vertical_datum?: string;
  status: string;
  is_active?: boolean;
  /** Set when the file or its settings changed and its outputs have not been rebuilt; a generate
   * request that references the asset's URL clears it. */
  needs_processing?: boolean;
  replaces_id?: string;
  superseded_by?: string;
  metadata?: Record<string, unknown>;
  created_at?: EpochMs;
  updated_at?: EpochMs;
  deleted_at?: EpochMs;
  created_by?: Author;
}

export interface InitiatedUpload {
  asset: SourceAsset;
  upload_url: string;
}

/** Mints signed PUT URLs under original/<survey_id>/ and records pending
 * assets. The client PUTs each file to its upload_url, then calls
 * markAssetUploaded. */
export function initUploads(
  surveyId: string,
  files: UploadInitFile[]
): Promise<{ uploads: InitiatedUpload[] }> {
  return apiFetch<{ uploads: InitiatedUpload[] }>(BASE, `/surveys/${surveyId}/assets/init`, {
    method: "POST",
    body: { files },
  });
}

export function markAssetUploaded(surveyId: string, assetId: string): Promise<SourceAsset> {
  return apiFetch<SourceAsset>(BASE, `/surveys/${surveyId}/assets/${assetId}/uploaded`, {
    method: "PUT",
  });
}

/** Source objects uploaded/registered on a survey (status: pending_upload |
 * registered). Removed and superseded assets are not listed. */
export async function listSurveyAssets(surveyId: string): Promise<{ assets: SourceAsset[] }> {
  return { assets: await listAll<SourceAsset>(`/surveys/${surveyId}/assets`, "assets") };
}

export interface UpdateSurveyAssetRequest {
  kind?: string;
  role?: string;
  crs?: string;
  vertical_datum?: string;
}

/** Returns the asset with `needs_processing` set. */
export function updateSurveyAsset(surveyId: string, assetId: string, body: UpdateSurveyAssetRequest): Promise<SourceAsset> {
  return apiFetch<SourceAsset>(BASE, `/surveys/${surveyId}/assets/${assetId}`, { method: "PATCH", body });
}

/** Soft delete (`status: "removed"`); the server also deactivates the file's processed output, so
 * nothing needs reprocessing afterwards. */
export function removeSurveyAsset(surveyId: string, assetId: string): Promise<SourceAsset> {
  return apiFetch<SourceAsset>(BASE, `/surveys/${surveyId}/assets/${assetId}`, { method: "DELETE" });
}

/** Addressable input artifact for a processor (asset-svc dtos.ArtifactRefDTO). */
export interface GenerateArtifactRef {
  url: string;
  kind: string;
  crs?: string;
}

/** Body for POST /surveys/:id/generate — dispatches one processor workflow.
 * `payload` is the processor's typed input (workflow-geo-svc framework
 * schemas); see lib/upload/planner.ts for the per-processor shapes. */
export interface GenerateRequest {
  processor_type: string;
  version?: string;
  payload?: Record<string, unknown>;
  inputs?: GenerateArtifactRef[];
}

export function generateSurvey(
  surveyId: string,
  req: GenerateRequest
): Promise<{ workflow_id: string; status: string }> {
  return apiFetch<{ workflow_id: string; status: string }>(BASE, `/surveys/${surveyId}/generate`, {
    method: "POST",
    body: req,
  });
}

/** Body for POST /designs — registers an uploaded design file on a project. */
export interface CreateDesignRequest {
  project_id: string;
  name: string;
  format: string; // dxf | landxml | obj | geojson | ifc
  file_url: string;
  source_crs?: string;
  metadata?: Record<string, unknown>;
}

/** The design rasterized onto the survey grid by orblode-workers; a cut/fill
 * can be measured against it once `status` is "ready". */
export interface DesignSurface {
  status: "processing" | "ready" | "failed";
  error?: string;
  method?: string; // "tin" | "linear_from_vertices"
  triangle_count?: number;
  z_min?: number;
  z_max?: number;
  updated_at?: EpochMs;
}

export interface DesignRecord {
  id: string;
  project_id: string;
  name: string;
  format: string;
  file_url?: string;
  source_crs?: string;
  status?: string;
  surface?: DesignSurface;
  created_at?: EpochMs;
  updated_at?: EpochMs;
  created_by?: Author;
  edited_by?: Author;
}

export function createDesign(req: CreateDesignRequest): Promise<DesignRecord> {
  return apiFetch<DesignRecord>(BASE, "/designs", { method: "POST", body: req });
}

/** Queues the design's surface again (POST /designs/:id/process). */
export function processDesign(designId: string): Promise<DesignRecord> {
  return apiFetch<DesignRecord>(BASE, `/designs/${designId}/process`, { method: "POST", body: {} });
}

export async function listDesigns(projectId: string): Promise<{ designs: DesignRecord[] }> {
  return { designs: await listAll<DesignRecord>(`/designs?project_id=${encodeURIComponent(projectId)}`, "designs") };
}

export interface ManifestSurvey {
  id: string;
  project_id: string;
  status: string;
  survey_date: string;
  working_crs?: string;
  vertical_datum?: string;
  version?: { id: string; number: number; status: string };
}

/** Elevation statistics the terrain processor computes from the surface raster
 * (terrain_surfaces.metadata->'stats'). Elevations are meters in the layer's
 * vertical datum; histogram spans [histogram_min, histogram_max]. */
export interface TerrainStats {
  min_elevation: number;
  max_elevation: number;
  mean: number;
  std_dev: number;
  histogram?: number[];
  histogram_min?: number;
  histogram_max?: number;
}

/** bbox is [west, south, east, north] in degrees. */
export interface TerrainLayer {
  surface_type: string; // dsm | dtm
  tile_directory_url?: string;
  raw_raster_url?: string;
  bbox?: number[];
  min_zoom?: number;
  max_zoom?: number;
  crs?: string;
  vertical_datum?: string;
  stats?: TerrainStats;
}

export interface AssetLayer {
  processor_type: string;
  asset_kind: string; // ortho | pointcloud | lens
  output_urls?: Record<string, string>;
  bbox?: number[];
  min_zoom?: number;
  max_zoom?: number;
  crs?: string;
}

export interface VectorLayer {
  role: string;
  geojson_url?: string;
  format?: string;
  feature_count: number;
  crs?: string;
  interval_m?: number;
  properties?: Record<string, unknown>;
}

export interface SiteModelLayer {
  asset_id: string;
  tileset_url?: string;
  /** Source mesh format: photogrammetry (3mx/osgb/obj/3tz — renders crisp on
   * terrain) vs `dxf` (a thin CAD surface that floats/cliffs). Drives the
   * viewer's hero default. */
  source_format?: string;
  anchor_lon: number;
  anchor_lat: number;
  anchor_height: number;
  crs?: string;
  vertical_datum?: string;
}

export interface DesignLayer {
  id: string;
  name: string;
  format: string;
  file_url?: string;
  crs?: string;
  vertical_datum?: string;
}

export interface ManifestLayers {
  terrain: TerrainLayer[] | null;
  ortho: AssetLayer[] | null;
  pointcloud: AssetLayer[] | null;
  lenses: AssetLayer[] | null;
  vectors: VectorLayer[] | null;
  site_models: SiteModelLayer[] | null;
  designs: DesignLayer[] | null;
}

// The §7.1 v1 result document stored verbatim on measurements.result by the
// measurement-result consumer: metrics + artifacts + provenance ("receipt") on
// success, error {class, message} on failure. Legacy rows are flat metric maps —
// the index signature admits them; read via lib/viewer/calc.ts metricsOf().
export interface MeasurementResultDoc {
  version?: number;
  semantics?: string;
  metrics?: Record<string, number>;
  artifacts?: {
    diff_raster_url?: string;
    heatmap_tiles_url?: string;
    base_surface_url?: string;
    bbox?: number[];
  };
  provenance?: {
    processor?: string;
    effective?: Record<string, unknown>;
    inputs?: unknown[];
    tools?: Record<string, string>;
  };
  error?: { class: string; message: string };
  [key: string]: unknown;
}

export interface MeasurementSummary {
  id: string;
  kind: string;
  name: string;
  folder?: string;
  geometry?: GeoJsonGeometry;
  params?: Record<string, unknown>;
  status: string; // draft | computing | completed | failed
  result_ref?: string;
  result?: MeasurementResultDoc;
}

export interface Manifest {
  survey: ManifestSurvey;
  layers: ManifestLayers;
  measurements: MeasurementSummary[] | null;
}

export function getManifest(surveyId: string): Promise<Manifest> {
  return apiFetch<Manifest>(BASE, `/surveys/${surveyId}/manifest`);
}

export interface Measurement {
  id: string;
  client_id: string;
  survey_id: string;
  kind: string;
  name: string;
  folder?: string;
  geometry?: GeoJsonGeometry;
  params?: Record<string, unknown>;
  status: string; // draft | computing | completed | failed
  /** Draw-first draft: created the moment a shape is finished, not yet kept.
   * Promote via updateMeasurement({draft:false}); orthogonal to status. */
  draft?: boolean;
  result_ref?: string;
  /** The LATEST run's v1 doc (success or error) — failure display + legacy rows. */
  result?: MeasurementResultDoc;
  /** Per-calc-type memory: kind → that type's last SUCCESSFUL v1 doc. The type
   * dropdown is a view switch over this map; compute is explicit Run/Re-run. */
  results?: Record<string, MeasurementResultDoc>;
  /** The stockpile's pile across surveys; `manual` when linked by hand, which matching never changes. */
  pile_id?: string;
  pile_link?: "auto" | "manual";
  created_at: EpochMs;
  updated_at: EpochMs;
  computed_at?: EpochMs;
  created_by?: Author;
  edited_by?: Author;
}

export interface CreateMeasurementRequest {
  kind: string; // stockpile | volume | cut_fill | cross_section | contour | tin
  name: string;
  folder?: string;
  geometry?: GeoJsonGeometry;
  params?: Record<string, unknown>;
  draft?: boolean;
}

/** PUT body — every field optional; omitted = unchanged. `params` is a
 * PARTIAL object deep-merged server-side over the stored params (§6.1
 * override semantics); `draft: false` promotes a draw-first draft. */
export interface UpdateMeasurementRequest {
  name?: string;
  folder?: string;
  kind?: string;
  geometry?: GeoJsonGeometry;
  params?: Record<string, unknown>;
  draft?: boolean;
}

/** Optional `search` filters server-side by measurement name (case-insensitive
 * substring, `?search=`). Empty/blank is omitted so the URL stays
 * clean and the endpoint returns the full set. */
export async function listMeasurements(
  surveyId: string,
  search?: string
): Promise<{ measurements: Measurement[] }> {
  const q = search?.trim();
  const qs = q ? `?search=${encodeURIComponent(q)}` : "";
  return { measurements: await listAll<Measurement>(`/surveys/${surveyId}/measurements${qs}`, "measurements") };
}

export function createMeasurement(surveyId: string, req: CreateMeasurementRequest): Promise<Measurement> {
  return apiFetch<Measurement>(BASE, `/surveys/${surveyId}/measurements`, {
    method: "POST",
    body: req,
  });
}

/** Partial update (PUT): rename, re-folder, re-kind, params patch, draft
 * promotion. Returns the fresh row. */
export function updateMeasurement(
  surveyId: string,
  measurementId: string,
  body: UpdateMeasurementRequest
): Promise<Measurement> {
  return apiFetch<Measurement>(
    BASE,
    `/surveys/${surveyId}/measurements/${measurementId}`,
    { method: "PUT", body }
  );
}

/** Compute response. An instant method (`smart_base`, `reference_level`) is
 * computed synchronously in PostGIS: `status: "completed"` with `result` = the
 * persisted §7.1 doc, rendered straight away. */
export interface ComputeResponse {
  workflow_id?: string;
  status: string; // "computing" | "completed"
  result?: MeasurementResultDoc;
}

/** POST /compute body: `params` is a partial params object the backend
 * deep-merges over the stored params AND persists before computing (§6.1 — the
 * row always states what ran); `force` bypasses the compute-in-flight 409.
 * Empty body = run with stored params. Only volume / stockpile / cut_fill with
 * an instant method compute; anything else answers 422 with the reason. */
export interface ComputeMeasurementBody {
  params?: Record<string, unknown>;
  force?: boolean;
}

export function computeMeasurement(
  surveyId: string,
  measurementId: string,
  body?: ComputeMeasurementBody
): Promise<ComputeResponse> {
  return apiFetch<ComputeResponse>(
    BASE,
    `/surveys/${surveyId}/measurements/${measurementId}/compute`,
    { method: "POST", body: body ?? {} }
  );
}

/** Soft delete: 200 with `data: null` (an older 204 is handled the same way). */
export async function deleteMeasurement(surveyId: string, measurementId: string): Promise<void> {
  await apiFetch<null>(BASE, `/surveys/${surveyId}/measurements/${measurementId}`, {
    method: "DELETE",
  });
}

/** A folder row (viewer-shell §6.2). parent_id null = workspace (depth 0);
 * children nest to depth 5. Project-scoped — persists across surveys. */
export interface FolderRecord {
  id: string;
  client_id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  depth: number;
  position: number;
  created_at: EpochMs;
  updated_at: EpochMs;
  created_by?: Author;
  edited_by?: Author;
}

/** FROZEN wire node for GET /projects/:id/folder-tree — `itemIds` is
 * deliberately camelCase (contract §6.1/§6.2), matching the FE tree type. */
export interface FolderTreeNode {
  id: string;
  name: string;
  kind: "workspace" | "folder";
  depth: number;
  children: FolderTreeNode[];
  itemIds: string[];
}

/** The whole project tree in one call; each node's itemIds filtered to the
 * given survey's measurements. */
export function getFolderTree(
  projectId: string,
  surveyId: string
): Promise<{ workspaces: FolderTreeNode[] }> {
  return apiFetch<{ workspaces: FolderTreeNode[] }>(
    BASE,
    `/projects/${projectId}/folder-tree?survey_id=${encodeURIComponent(surveyId)}`
  );
}

/** Create a folder; omit parent_id (or pass null) for a top-level workspace. */
export function createFolder(req: {
  project_id: string;
  parent_id?: string | null;
  name: string;
}): Promise<FolderRecord> {
  return apiFetch<FolderRecord>(BASE, "/folders", { method: "POST", body: req });
}

/** Rename / reposition / move a folder. `parent_id` is THREE-WAY: omit the key
 * to leave the parent alone; null promotes to a workspace (root); a string
 * moves under that parent (server revalidates depth/cycle/tenant). */
export function updateFolder(
  folderId: string,
  body: { name?: string; parent_id?: string | null; position?: number }
): Promise<FolderRecord> {
  return apiFetch<FolderRecord>(BASE, `/folders/${folderId}`, { method: "PUT", body });
}

/** Deletes the folder with its child folders and memberships (200, `data: null`). Measurements
 * SURVIVE — they simply fall back to Ungrouped. */
export async function deleteFolder(folderId: string): Promise<void> {
  await apiFetch<null>(BASE, `/folders/${folderId}`, { method: "DELETE" });
}

/** Batch add/remove measurement membership; returns the folder's resulting
 * full membership (all surveys). */
export function updateFolderItems(
  folderId: string,
  body: { add?: string[]; remove?: string[] }
): Promise<{ item_ids: string[] }> {
  return apiFetch<{ item_ids: string[] }>(BASE, `/folders/${folderId}/items`, {
    method: "PUT",
    body,
  });
}

/** The instant-compute tier's §7.1-shaped result: computed synchronously in
 * PostGIS from the measurement's CURRENT stored params, NOT persisted. Metrics
 * carry the SAME keys as a worker doc (net_change_m3, volume_m3, area_m2, …) so
 * the panel renders them identically; `estimate:true` marks it display-only. */
export interface EstimateResult {
  version: number;
  semantics: string; // "postgis_instant_v1"
  estimate: true;
  metrics: Record<string, number>;
  provenance: { engine: string; query_ms: number; tiles_scanned: number };
}

/** A volume measurement's cut/fill drawn by orblode-svc (GET /heatmap) from its
 * current params: a PNG data URL covering `bounds` (west, south, east, north in
 * WGS84), red at −scale_m (cut) through transparent within ±deadband_m to blue
 * at +scale_m (fill). */
export interface MeasurementHeatmap {
  bounds: [number, number, number, number];
  scale_m: number;
  deadband_m: number;
  image: string;
}

export function getMeasurementHeatmap(surveyId: string, measurementId: string): Promise<MeasurementHeatmap> {
  return apiFetch<MeasurementHeatmap>(BASE, `/surveys/${surveyId}/measurements/${measurementId}/heatmap`);
}

/** Synchronous instant estimate (POST /estimate). Resolves in tens of ms for a
 * panel-scale boundary. A method no worker runs answers 422 with the reason;
 * an unregistered surface, timeout or busy tier answers 409/429/503/504. */
export function estimateMeasurement(
  surveyId: string,
  measurementId: string
): Promise<EstimateResult> {
  return apiFetch<EstimateResult>(
    BASE,
    `/surveys/${surveyId}/measurements/${measurementId}/estimate`,
    { method: "POST", body: {} }
  );
}

export interface Material {
  id: string;
  project_id: string;
  name: string;
  density_t_m3: number;
  default_cut_factor: number;
  default_fill_factor: number;
  value_per_t: number;
}

export interface MaterialInput {
  name: string;
  density_t_m3: number;
  default_cut_factor?: number;
  default_fill_factor?: number;
  value_per_t: number;
}

export async function listMaterials(projectId: string): Promise<Material[]> {
  return listAll<Material>(`/materials?project_id=${encodeURIComponent(projectId)}`, "materials");
}

export function createMaterial(projectId: string, input: MaterialInput): Promise<Material> {
  return apiFetch<Material>(BASE, "/materials", { method: "POST", body: { project_id: projectId, ...input } });
}

export function updateMaterial(materialId: string, input: Partial<MaterialInput>): Promise<Material> {
  return apiFetch<Material>(BASE, `/materials/${materialId}`, { method: "PUT", body: input });
}

export async function deleteMaterial(materialId: string): Promise<void> {
  await apiFetch<null>(BASE, `/materials/${materialId}`, { method: "DELETE" });
}

/** Links a stockpile by hand to one of the previous survey's piles; `""` makes it a pile of its own. */
export function linkPile(surveyId: string, measurementId: string, pileId: string): Promise<Measurement> {
  return apiFetch<Measurement>(BASE, `/surveys/${surveyId}/measurements/${measurementId}/pile`, {
    method: "PUT",
    body: { pile_id: pileId },
  });
}

export function copyStockpilesForward(surveyId: string): Promise<Measurement[]> {
  return apiFetch<Measurement[]>(BASE, `/surveys/${surveyId}/stockpiles/copy-forward`, { method: "POST" });
}

export interface ComputeStockpilesResult {
  queued: string[];
  current: number;
  skipped: { measurement_id: string; name: string; reason: string }[];
}

/** Queues every stockpile of the survey without a current result to the background compute. */
export function computeStockpiles(surveyId: string): Promise<ComputeStockpilesResult> {
  return apiFetch<ComputeStockpilesResult>(BASE, `/surveys/${surveyId}/stockpiles/compute`, { method: "POST" });
}

export interface SurveyRef {
  id: string;
  date: string;
}

export type PileState = "computed" | "stale" | "computing" | "failed" | "not_computed";

export interface InventoryPile {
  measurement_id: string;
  name: string;
  pile_id: string;
  pile_link?: "auto" | "manual";
  material_id?: string;
  material_name?: string;
  state: PileState;
  volume_m3?: number;
  adjusted_volume_m3?: number;
  tonnage_t?: number;
  value?: number;
  previous_volume_m3?: number;
  previous_tonnage_t?: number;
  delta_volume_m3?: number;
  delta_tonnage_t?: number;
}

export interface MaterialTotal {
  material_id: string;
  name: string;
  piles: number;
  volume_m3: number;
  tonnage_t: number;
  value: number;
  previous_tonnage_t?: number;
  delta_tonnage_t?: number;
}

export interface InventoryReport {
  survey: SurveyRef;
  previous_survey?: SurveyRef;
  piles: InventoryPile[];
  removed_piles: InventoryPile[];
  previous_piles: { pile_id: string; measurement_id: string; name: string }[];
  materials: MaterialTotal[];
  totals: {
    piles: number;
    computed: number;
    volume_m3: number;
    tonnage_t: number;
    value: number;
    previous_volume_m3?: number;
    previous_tonnage_t?: number;
    delta_volume_m3?: number;
    delta_tonnage_t?: number;
  };
}

export function getInventory(surveyId: string): Promise<InventoryReport> {
  return apiFetch<InventoryReport>(BASE, `/reports/inventory?survey_id=${encodeURIComponent(surveyId)}`);
}

export interface VarianceThresholds {
  green_pct: number;
  amber_pct: number;
}

export interface ReconciliationRow {
  material_id: string;
  name: string;
  opening_t: number;
  mined_t: number;
  dispatched_t: number;
  mass_balance_t: number;
  survey_closing_t: number;
  variance_t: number;
  variance_pct?: number;
  status: "green" | "amber" | "red" | "unknown";
}

export interface ReconciliationReport {
  project_id: string;
  from: SurveyRef;
  to: SurveyRef;
  thresholds: VarianceThresholds;
  materials: ReconciliationRow[];
  overall: ReconciliationRow;
  uncomputed: number;
}

export function getReconciliation(
  projectId: string,
  fromSurveyId: string,
  toSurveyId: string,
  thresholds?: VarianceThresholds
): Promise<ReconciliationReport> {
  const q = new URLSearchParams({ project_id: projectId, from_survey: fromSurveyId, to_survey: toSurveyId });
  if (thresholds) {
    q.set("green_pct", String(thresholds.green_pct));
    q.set("amber_pct", String(thresholds.amber_pct));
  }
  return apiFetch<ReconciliationReport>(BASE, `/reports/reconciliation?${q}`);
}

/** Forecast stock and its range are floored at 0 t. */
export interface MaterialTrend {
  material_id: string;
  name: string;
  points: { survey_id: string; date: string; tonnage_t: number; volume_m3: number; fitted_t?: number }[];
  slope_t_per_day?: number;
  forecast: { date: string; tonnage_t: number; low_t?: number; high_t?: number }[];
  depletion_date?: string;
  anomalies: { survey_id: string; date: string; delta_t: number; z: number }[];
}

export interface TrendsReport {
  project_id: string;
  surveys: SurveyRef[];
  materials: MaterialTrend[];
  gaps: { from: SurveyRef; to: SurveyRef; days: number }[];
}

export function getTrends(projectId: string): Promise<TrendsReport> {
  return apiFetch<TrendsReport>(BASE, `/reports/trends?project_id=${encodeURIComponent(projectId)}`);
}

export interface ProductionRecord {
  id: string;
  material_id: string;
  period_start: string;
  period_end: string;
  mined_t: number;
  dispatched_t: number;
}

export interface ProductionLine {
  material_id: string;
  mined_t: number;
  dispatched_t: number;
}

export async function listProductionRecords(projectId: string): Promise<ProductionRecord[]> {
  const res = await apiFetch<{ records: ProductionRecord[] | null }>(
    BASE,
    `/production-records?project_id=${encodeURIComponent(projectId)}`
  );
  return res.records ?? [];
}

/** Replaces exactly this period's records; an empty list clears it. */
export async function putProductionRecords(
  projectId: string,
  periodStart: string,
  periodEnd: string,
  records: ProductionLine[]
): Promise<ProductionRecord[]> {
  const res = await apiFetch<{ records: ProductionRecord[] | null }>(BASE, "/production-records", {
    method: "PUT",
    body: { project_id: projectId, period_start: periodStart, period_end: periodEnd, records },
  });
  return res.records ?? [];
}
