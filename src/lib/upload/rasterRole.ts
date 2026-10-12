import { fromBlob } from "geotiff";
import { roleFromRasterBands, roleNeedsHeader, type DataType, type FileRole } from "./planner.ts";

/** The role a GeoTIFF's header implies, or null when it isn't a readable TIFF. Reads only the header. */
export async function readRasterRole(file: Blob): Promise<FileRole | null> {
  try {
    const image = await (await fromBlob(file)).getImage();
    return roleFromRasterBands(image.getSamplesPerPixel(), image.getBitsPerSample());
  } catch {
    return null;
  }
}

/** Reads the header of each file whose name can't settle its role and hands the answer to `settle`. */
export async function refineRoles(files: File[], dataType: DataType, settle: (file: File, role: FileRole | null) => void) {
  await Promise.all(files.filter((f) => roleNeedsHeader(f.name, dataType)).map(async (f) => settle(f, await readRasterRole(f))));
}
