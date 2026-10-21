import type { PhotoExif } from "../api/mm.ts";

// What a drone photo says about where it was taken, from its EXIF and DJI's XMP: enough to suggest which photos show
// a ground control point and to judge the flight's coverage before it is processed.

type Tags = Record<string, unknown>;

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number.parseFloat(v) : typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** The fields Orblode keeps from exifr's merged EXIF, GPS and XMP tags. */
export function exifFromTags(tags: Tags): PhotoExif {
  const out: PhotoExif = {};
  const lat = num(tags.latitude);
  const lon = num(tags.longitude);
  if (lat !== undefined && lon !== undefined && !(lat === 0 && lon === 0)) {
    out.lat = lat;
    out.lon = lon;
  }
  const gpsAltitude = num(tags.GPSAltitude);
  const absolute = num(tags.AbsoluteAltitude) ?? (gpsAltitude !== undefined && tags.GPSAltitudeRef === 1 ? -gpsAltitude : gpsAltitude);
  if (absolute !== undefined) out.altitude_m = absolute;
  const relative = num(tags.RelativeAltitude);
  if (relative !== undefined) out.rel_alt_m = relative;
  const yaw = num(tags.GimbalYawDegree) ?? num(tags.FlightYawDegree);
  if (yaw !== undefined) out.yaw_deg = yaw;
  const focal = num(tags.FocalLength);
  if (focal !== undefined) out.focal_mm = focal;
  const focal35 = num(tags.FocalLengthIn35mmFormat);
  if (focal35 !== undefined && focal35 > 0) out.focal_35mm = focal35;
  const width = num(tags.ExifImageWidth) ?? num(tags.ImageWidth);
  const height = num(tags.ExifImageHeight) ?? num(tags.ImageHeight);
  if (width && height) {
    out.width = width;
    out.height = height;
  }
  if (typeof tags.Make === "string") out.make = tags.Make.trim();
  if (typeof tags.Model === "string") out.model = tags.Model.trim();
  const taken = tags.DateTimeOriginal ?? tags.CreateDate;
  if (taken instanceof Date && !Number.isNaN(taken.getTime())) out.taken_at = taken.toISOString();
  // DJI writes 50 for a fixed RTK solution, 16 and 34 for single and float.
  if (num(tags.RtkFlag) === 50) out.rtk = true;
  return out;
}

/** Reads a photo's tags; a photo without them is still uploaded, only not suggested for marking. */
export async function readPhotoExif(file: File): Promise<PhotoExif> {
  try {
    const { parse } = await import("exifr");
    const tags = (await parse(file, { gps: true, tiff: true, exif: true, xmp: true, icc: false, iptc: false, jfif: false, ihdr: false })) as Tags | undefined;
    return tags ? exifFromTags(tags) : {};
  } catch {
    return {};
  }
}
