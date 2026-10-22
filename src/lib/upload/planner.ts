// Upload planning — pure logic, no React, no network.
//
// Maps the Upload page's data types + files onto orblode-svc:
//  - ingest kinds (terrain | ortho | pointcloud | vector | site_model), and
//  - processor dispatches (POST /surveys/:id/generate), limited to the types a
//    legacy worker runs. Payload shapes are what orblode-svc translates for
//    those workers — field names matter, they are validated server-side.
//
// DSM/DTM rasters dispatch `terrain-quantized-mesh` directly; the uploaded
// raster becomes the terrain layer's raw_raster_url as well as its tiles.

import type { GenerateRequest } from "@/lib/api/orblodeSvc";

export type DataType = "lidar" | "preprocessed" | "design";

/** Per-file role driving both the ingest kind and the processor plan. */
export type FileRole =
  | "pointcloud" // .las/.laz → pointcloud-tiles
  | "dsm" // GeoTIFF surface → terrain-quantized-mesh
  | "dtm"
  | "ortho" // orthophoto GeoTIFF → orthophoto-tiles
  | "contours" // vector contours → vector-features
  | "vector" // other vector overlays → vector-features
  | "site_model" // mesh (needs a WGS84 anchor — ingest only, no auto-dispatch)
  | "design"; // project design file → POST /designs

export const ROLE_LABELS: Record<FileRole, string> = {
  pointcloud: "Point cloud",
  dsm: "DSM",
  dtm: "DTM",
  ortho: "Orthophoto",
  contours: "Contours",
  vector: "Vector",
  site_model: "3D mesh",
  design: "Design",
};

/** What the planner's dispatch builds from a file of each role; null where nothing is processed. */
export const PROCESSED_OUTPUT: Record<FileRole, string | null> = {
  pointcloud: "Point-cloud tiles",
  dsm: "Terrain DSM tiles",
  dtm: "Terrain DTM tiles",
  ortho: "Ortho tiles",
  contours: "Contour layer",
  vector: "Vector layer",
  site_model: null,
  design: null,
};

/** Roles the user may switch a file to, per data type (the per-row select). */
export const SELECTABLE_ROLES: Record<DataType, FileRole[]> = {
  lidar: ["pointcloud"],
  preprocessed: ["dsm", "dtm", "ortho", "pointcloud", "contours", "vector", "site_model"],
  design: ["design"],
};

/** File-picker accept list per data type. */
export const ACCEPT: Record<DataType, string> = {
  lidar: ".las,.laz,.zip",
  preprocessed: ".tif,.tiff,.las,.laz,.dxf,.shp,.geojson,.json,.zip,.obj,.osgb,.3mx",
  design: ".dxf,.xml,.geojson,.json,.obj,.ifc",
};

export const DROPZONE_HINT: Record<DataType, string> = {
  lidar: "LAS / LAZ point clouds",
  preprocessed: "GeoTIFF DSM / DTM / ortho, LAZ, contour DXF / zipped SHP / GeoJSON",
  design: "DXF, LandXML, GeoJSON, OBJ, IFC design surfaces",
};

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** What vector-features hands to ogr2ogr, directly or from inside a ZIP. */
const VECTOR_FEATURE_EXTENSIONS = new Set(["dxf", "shp", "geojson", "json", "kml", "gpkg", "zip"]);

/** Exports with a vector extension and no 2D linework: a DXF mesh of 3D faces
 * (Propeller's `…_DXF_<n>_faces.zip`), or an orthophoto as JPEG tiles in a ZIP (`…_JFIF_JPEG_….zip`). */
const isFaceMesh = (lowerName: string) => /(^|[\s._-])faces\.(zip|dxf)$/.test(lowerName);
const isJpegZip = (lowerName: string) => ext(lowerName) === "zip" && /jfif|jpe?g/.test(lowerName);
/** GDAL opens a .shp only with its .shx beside it, and the upload takes a shapefile's parts only as one ZIP. */
const isBareShapefile = (lowerName: string) => ext(lowerName) === "shp";

export function vectorFeaturesReads(filename: string): boolean {
  const n = filename.toLowerCase();
  return VECTOR_FEATURE_EXTENSIONS.has(ext(n)) && !isBareShapefile(n) && !isFaceMesh(n) && !isJpegZip(n);
}

function vectorSkipReason(lowerName: string): string {
  if (isBareShapefile(lowerName)) return "stored — a shapefile needs its .shx, .dbf and .prj; upload them together in one ZIP";
  if (isFaceMesh(lowerName)) return "stored — a DXF face mesh is a 3D surface, not vector linework; pick 3D mesh";
  if (isJpegZip(lowerName)) return "stored — a ZIP of JPEG images holds no vector data";
  if (ext(lowerName) === "czml") return "stored — GDAL can't read CZML, so no vector layer is built";
  return "stored — vector layers are built only from DXF, SHP, GeoJSON, KML or GeoPackage files, or a ZIP of them";
}

const isGeoTiff = (e: string) => e === "tif" || e === "tiff";

function rasterRoleFromName(lowerName: string): FileRole | null {
  if (lowerName.includes("dtm")) return "dtm";
  if (lowerName.includes("dsm")) return "dsm";
  if (lowerName.includes("ortho")) return "ortho";
  return null;
}

/** Best-guess role from the filename within a data type; the user can correct
 * it per file. Name hints (dsm/dtm/ortho/contour) win over bare extension. A
 * GeoTIFF with no hint guesses DSM until `roleFromRasterBands` reads its header. */
export function guessRole(filename: string, dataType: DataType): FileRole {
  const n = filename.toLowerCase();
  const e = ext(n);

  if (dataType === "design") return "design";
  if (dataType === "lidar") return "pointcloud";

  // preprocessed — sniff the role from the name, then the extension.
  if (e === "las" || e === "laz") return "pointcloud";
  if (e === "obj" || e === "osgb" || e === "3mx" || e === "ttm" || isFaceMesh(n)) return "site_model";
  if (isJpegZip(n)) return "ortho";
  if (isGeoTiff(e)) return rasterRoleFromName(n) ?? "dsm";
  if (VECTOR_FEATURE_EXTENSIONS.has(e)) return n.includes("contour") ? "contours" : "vector";
  return "vector";
}

export function roleNeedsHeader(filename: string, dataType: DataType): boolean {
  const n = filename.toLowerCase();
  return dataType === "preprocessed" && isGeoTiff(ext(n)) && rasterRoleFromName(n) === null;
}

/** Mirrors the terrain worker's refusal: three or more 8-bit bands are an image. */
export function roleFromRasterBands(samplesPerPixel: number, bitsPerSample: number): FileRole {
  return samplesPerPixel >= 3 && bitsPerSample === 8 ? "ortho" : "dsm";
}

/** Applies a header read to its file's row unless the user picked a role by hand
 * or the data type changed since (both clear `readingRole`); null keeps the name guess. */
export function settleRole<R extends { file: unknown; role: FileRole; readingRole: boolean }>(
  rows: R[],
  file: R["file"],
  role: FileRole | null
): R[] {
  return rows.map((q) => (q.file === file && q.readingRole ? { ...q, role: role ?? q.role, readingRole: false } : q));
}

/** Ingest kind for a role. */
export function roleToAssetKind(role: FileRole): string {
  switch (role) {
    case "pointcloud":
      return "pointcloud";
    case "dsm":
    case "dtm":
      return "terrain";
    case "ortho":
      return "ortho";
    case "contours":
    case "vector":
    case "design":
      return "vector";
    case "site_model":
      return "site_model";
  }
}

/** MIME type for the signed PUT (must match what the URL was signed with). */
export function contentTypeFor(filename: string): string {
  switch (ext(filename)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "tif":
    case "tiff":
      return "image/tiff";
    case "zip":
      return "application/zip";
    case "json":
    case "geojson":
      return "application/json";
    case "csv":
      return "text/csv";
    case "xml":
      return "application/xml";
    default:
      return "application/octet-stream";
  }
}

/** An uploaded file the planner turns into processor dispatches. */
export interface PlannedFile {
  name: string;
  role: FileRole;
  /** Bucket URL of the uploaded object (asset.url from initUploads). */
  url: string;
  /** This file's horizontal CRS; `PlannerOptions.epsg` applies when absent. */
  crs?: string;
  /** Why the file is stored, not processed, when its name and role don't show it, e.g. UNREADABLE_SKIP. */
  skip?: string;
  /** A vector or contour file of the site's, which every survey of the site shows. */
  siteWide?: boolean;
}

/** A file GDAL couldn't open when it was checked; a Detect again that reads it lifts this. */
export const UNREADABLE_SKIP = "stored — the file couldn't be read; detect it again to process it";

export interface PlannerOptions {
  /** Horizontal CRS for files that carry none, e.g. "EPSG:32645"; may be "". */
  epsg: string;
}

/** One generate call to fire, with a user-facing label. */
export interface PlannedDispatch {
  label: string;
  request: GenerateRequest;
}

/** What could not be auto-dispatched, and why (shown in the summary). */
export interface PlannedSkip {
  filename: string;
  reason: string;
}

export interface ProcessorPlan {
  dispatches: PlannedDispatch[];
  skips: PlannedSkip[];
}

/** Why a file of this role is stored but not processed, or null when the planner dispatches it (a design is registered instead). */
export function skipReason(filename: string, role: FileRole): string | null {
  const n = filename.toLowerCase();
  switch (role) {
    case "ortho":
      return isGeoTiff(ext(n)) ? null : "stored — orthophoto tiles are built only from a GeoTIFF";
    case "contours":
    case "vector":
      return vectorFeaturesReads(n) ? null : vectorSkipReason(n);
    case "site_model":
      return "3D mesh stored — no processor turns meshes into viewer tiles yet";
    default:
      return null;
  }
}

/** Builds the processor dispatch plan for a set of uploaded files. */
export function buildProcessorPlan(files: PlannedFile[], opts: PlannerOptions): ProcessorPlan {
  const dispatches: PlannedDispatch[] = [];
  const skips: PlannedSkip[] = [];

  // vector-features batches every vector file into one call.
  const vectorFiles: PlannedFile[] = [];

  for (const f of files) {
    if (f.role === "design") continue;
    const crs = f.crs || opts.epsg;
    const reason = skipReason(f.name, f.role) ?? f.skip ?? (crs ? null : "stored — its CRS isn't known; set one to process it");
    if (reason) {
      skips.push({ filename: f.name, reason });
      continue;
    }
    switch (f.role) {
      case "dsm":
      case "dtm":
        dispatches.push({
          label: `Terrain tiles ${f.role.toUpperCase()} (${f.name})`,
          request: {
            processor_type: "terrain-quantized-mesh",
            payload: {
              source: { url: f.url, kind: "terrain", crs },
              surface_type: f.role,
            },
            inputs: [{ url: f.url, kind: "terrain", crs }],
          },
        });
        break;
      case "ortho":
        dispatches.push({
          label: `Ortho tiles (${f.name})`,
          request: {
            processor_type: "orthophoto-tiles",
            payload: { source: { url: f.url, kind: "ortho", crs } },
            inputs: [{ url: f.url, kind: "ortho", crs }],
          },
        });
        break;
      case "pointcloud":
        dispatches.push({
          label: `Point-cloud tiles (${f.name})`,
          request: {
            processor_type: "pointcloud-tiles",
            payload: {
              source: { url: f.url, kind: "pointcloud", crs },
              source_crs: crs,
            },
            inputs: [{ url: f.url, kind: "pointcloud", crs }],
          },
        });
        break;
      case "contours":
      case "vector":
        vectorFiles.push({ ...f, crs });
        break;
    }
  }

  // The survey's own vector files and the site's go in separate calls: the site's are site-wide.
  for (const siteWide of [false, true]) {
    const batch = vectorFiles.filter((v) => !!v.siteWide === siteWide);
    if (batch.length === 0) continue;
    dispatches.push({
      label: `${siteWide ? "Site vectors" : "Vector features"} (${batch.map((v) => v.name).join(", ")})`,
      request: {
        processor_type: "vector-features",
        payload: {
          files: batch.map((v) => ({
            source: { url: v.url, kind: "vector", crs: v.crs },
            source_crs: v.crs,
            role: v.role === "contours" ? "contours" : "overlay",
            format: v.role === "contours" ? "contour" : "",
          })),
        },
        inputs: batch.map((v) => ({ url: v.url, kind: "vector", crs: v.crs })),
        ...(siteWide ? { site_wide: true } : {}),
      },
    });
  }

  return { dispatches, skips };
}

/** Design file format for POST /designs, from the filename. */
export function designFormat(filename: string): string {
  switch (ext(filename)) {
    case "dxf":
      return "dxf";
    case "xml":
      return "landxml";
    case "obj":
      return "obj";
    case "ifc":
      return "ifc";
    default:
      return "geojson";
  }
}
