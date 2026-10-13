import { fromBlob } from "geotiff";
import { roleFromRasterBands, roleNeedsHeader, type DataType, type FileRole } from "./planner.ts";

export interface RasterHeader {
  role: FileRole;
  /** The horizontal CRS its GeoKeys name, e.g. "EPSG:28356". */
  crs: string | null;
  verticalCrs: string | null;
}

const USER_DEFINED = 32767;

const epsgOf = (code: unknown) => (typeof code === "number" && code > 0 && code !== USER_DEFINED ? `EPSG:${code}` : null);

/** The CRS codes in a GeoTIFF's GeoKey directory: ProjectedCSType (3072), else GeographicType (2048), and VerticalCSType (4096). */
export function crsFromGeoKeys(keys: Record<string, unknown> | null): { crs: string | null; verticalCrs: string | null } {
  return {
    crs: epsgOf(keys?.ProjectedCSTypeGeoKey) ?? epsgOf(keys?.GeographicTypeGeoKey),
    verticalCrs: epsgOf(keys?.VerticalCSTypeGeoKey),
  };
}

/** What a GeoTIFF's header says, or null when it isn't a readable TIFF. Reads only the header. */
export async function readRasterHeader(file: Blob): Promise<RasterHeader | null> {
  try {
    const image = await (await fromBlob(file)).getImage();
    let keys: Record<string, unknown> | null = null;
    try {
      keys = image.getGeoKeys();
    } catch {
      keys = null;
    }
    return { role: roleFromRasterBands(image.getSamplesPerPixel(), image.getBitsPerSample()), ...crsFromGeoKeys(keys) };
  } catch {
    return null;
  }
}

/** The role a GeoTIFF's header implies, or null when it isn't a readable TIFF. */
export async function readRasterRole(file: Blob): Promise<FileRole | null> {
  return (await readRasterHeader(file))?.role ?? null;
}

/** Reads the header of each file whose name can't settle its role and hands the answer to `settle`. */
export async function refineRoles(files: File[], dataType: DataType, settle: (file: File, role: FileRole | null) => void) {
  await Promise.all(files.filter((f) => roleNeedsHeader(f.name, dataType)).map(async (f) => settle(f, await readRasterRole(f))));
}
