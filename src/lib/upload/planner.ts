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
  preprocessed: "GeoTIFF DSM / DTM / ortho, LAZ, contour DXF / SHP / GeoJSON",
  design: "DXF, LandXML, GeoJSON, OBJ, IFC design surfaces",
};

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** Best-guess role from the filename within a data type; the user can correct
 * it per file. Name hints (dsm/dtm/ortho/contour) win over bare extension. */
export function guessRole(filename: string, dataType: DataType): FileRole {
  const n = filename.toLowerCase();
  const e = ext(n);

  if (dataType === "design") return "design";
  if (dataType === "lidar") return "pointcloud";

  // preprocessed — sniff the role from the name, then the extension.
  if (e === "las" || e === "laz") return "pointcloud";
  if (e === "obj" || e === "osgb" || e === "3mx") return "site_model";
  if (e === "tif" || e === "tiff") {
    if (n.includes("dtm")) return "dtm";
    if (n.includes("dsm")) return "dsm";
    if (n.includes("ortho")) return "ortho";
    return "dsm"; // most pre-processed GeoTIFFs here are surfaces
  }
  if (e === "dxf" || e === "shp" || e === "geojson" || e === "json" || e === "zip") {
    return n.includes("contour") ? "contours" : "vector";
  }
  return "vector";
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
}

export interface PlannerOptions {
  /** Horizontal CRS chosen in the form, e.g. "EPSG:32645". */
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

/** Builds the processor dispatch plan for a set of uploaded files. */
export function buildProcessorPlan(files: PlannedFile[], opts: PlannerOptions): ProcessorPlan {
  const dispatches: PlannedDispatch[] = [];
  const skips: PlannedSkip[] = [];

  // vector-features batches every vector file into one call.
  const vectorFiles: PlannedFile[] = [];

  for (const f of files) {
    const crs = f.crs || opts.epsg;
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
      case "site_model":
        skips.push({
          filename: f.name,
          reason: "3D mesh stored — no processor turns meshes into viewer tiles yet",
        });
        break;
      case "design":
        // Designs are registered via POST /designs, not a processor dispatch.
        break;
    }
  }

  if (vectorFiles.length > 0) {
    dispatches.push({
      label: `Vector features (${vectorFiles.map((v) => v.name).join(", ")})`,
      request: {
        processor_type: "vector-features",
        payload: {
          files: vectorFiles.map((v) => ({
            source: { url: v.url, kind: "vector", crs: v.crs },
            source_crs: v.crs,
            role: v.role === "contours" ? "contours" : "overlay",
            format: v.role === "contours" ? "contour" : "",
          })),
        },
        inputs: vectorFiles.map((v) => ({ url: v.url, kind: "vector", crs: v.crs })),
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
