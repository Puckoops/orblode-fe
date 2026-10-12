import type { DataType } from "./planner.ts";

export const DATA_TYPES: { id: DataType; label: string }[] = [
  { id: "lidar", label: "LiDAR" },
  { id: "preprocessed", label: "Pre-processed" },
  { id: "design", label: "Design" },
];

/** Curated horizontal CRS options (value is what processors receive). */
export const CRS_OPTIONS = [
  { value: "EPSG:4326", label: "WGS84 (EPSG:4326)" },
  { value: "EPSG:32643", label: "WGS84 / UTM Zone 43N" },
  { value: "EPSG:32644", label: "WGS84 / UTM Zone 44N" },
  { value: "EPSG:32645", label: "WGS84 / UTM Zone 45N" },
  { value: "EPSG:32754", label: "WGS84 / UTM Zone 54S" },
  { value: "EPSG:32755", label: "WGS84 / UTM Zone 55S" },
  { value: "EPSG:32756", label: "WGS84 / UTM Zone 56S" },
  { value: "EPSG:28354", label: "GDA94 / MGA Zone 54" },
  { value: "EPSG:28355", label: "GDA94 / MGA Zone 55" },
  { value: "EPSG:28356", label: "GDA94 / MGA Zone 56" },
  { value: "EPSG:7854", label: "GDA2020 / MGA Zone 54" },
  { value: "EPSG:7855", label: "GDA2020 / MGA Zone 55" },
  { value: "EPSG:7856", label: "GDA2020 / MGA Zone 56" },
];

export const VDATUM_OPTIONS = [
  { value: "EGM2008", label: "EGM2008" },
  { value: "EGM96", label: "EGM96" },
  { value: "ellipsoidal", label: "Ellipsoidal (WGS84)" },
  { value: "AHD", label: "AHD" },
];

export const TAG_SUGGESTIONS = ["pit", "survey", "lidar", "design"];

/** `options` plus `value` when it is set and not among them, so a stored value always shows. */
export function withCurrent(options: { value: string; label: string }[], value: string | undefined) {
  return value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options;
}
