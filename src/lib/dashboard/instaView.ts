// Insta View: files a person opens over the sites globe to look at. They are drawn in the browser
// and never uploaded, so they are gone when the page is left.

export type OverlayFormat = "kml" | "geojson" | "czml" | "gpx";

const FORMATS: Record<string, OverlayFormat> = {
  kml: "kml",
  kmz: "kml",
  geojson: "geojson",
  json: "geojson",
  topojson: "geojson",
  czml: "czml",
  gpx: "gpx",
};

export const INSTA_VIEW_ACCEPT = Object.keys(FORMATS)
  .map((ext) => `.${ext}`)
  .join(",");

/** Overlays parse on the main thread, so a bigger file stalls the globe for seconds. */
export const INSTA_VIEW_MAX_BYTES = 50 * 1024 * 1024;

export interface InstaOverlay {
  id: string;
  file: File;
  format: OverlayFormat;
  visible: boolean;
  loaded: boolean;
}

/** Asks the globe to fly to an overlay; `seq` changes on every ask so the same overlay can be asked twice. */
export interface OverlayFocus {
  id: string;
  seq: number;
}

/** In degrees. */
export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** What the camera frames for an overlay: its bounds with a margin, widened so a lone point or a straight line still shows its surroundings. */
export function framingBounds(b: Bounds, margin = 0.1, minSpan = 0.01): Bounds {
  // Bounds across the antimeridian run west > east; they are framed as they are.
  if (b.west > b.east) return b;
  const lonPad = Math.max((b.east - b.west) * margin, (minSpan - (b.east - b.west)) / 2);
  const latPad = Math.max((b.north - b.south) * margin, (minSpan - (b.north - b.south)) / 2);
  return {
    west: Math.max(b.west - lonPad, -180),
    south: Math.max(b.south - latPad, -90),
    east: Math.min(b.east + lonPad, 180),
    north: Math.min(b.north + latPad, 90),
  };
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export type OverlayCheck = { format: OverlayFormat } | { error: string };

export function checkOverlayFile(file: Pick<File, "name" | "size">): OverlayCheck {
  const format = FORMATS[extensionOf(file.name)];
  if (!format) return { error: `${file.name} can't be opened. Insta View opens KML, KMZ, GeoJSON, CZML and GPX files.` };
  if (file.size === 0) return { error: `${file.name} is empty.` };
  if (file.size > INSTA_VIEW_MAX_BYTES) return { error: `${file.name} is over 50 MB, too big to open in the browser.` };
  return { format };
}

/** A `.json` file may hold CZML, which is an array of packets where GeoJSON is always an object. */
export function jsonOverlayFormat(name: string, parsed: unknown): "geojson" | "czml" {
  const ext = extensionOf(name);
  if (ext === "czml") return "czml";
  return ext === "json" && Array.isArray(parsed) ? "czml" : "geojson";
}

export function overlayLoadError(name: string, err: unknown): string {
  if (err instanceof SyntaxError) return `${name} isn't valid JSON.`;
  const message = (err as { message?: unknown } | null)?.message;
  const crs = typeof message === "string" ? /^Unknown crs (?:name|EPSG code): (.+)$/.exec(message) : null;
  if (crs) {
    const code = /(\d+)\s*$/.exec(crs[1])?.[1];
    return `${name} is in ${code ? `EPSG:${code}` : crs[1]}. Insta View draws GeoJSON in WGS 84 (EPSG:4326) only.`;
  }
  return `${name} couldn't be drawn. It may be damaged, or use features the globe can't show.`;
}
