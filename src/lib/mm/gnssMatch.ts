import type { GnssJob } from "../api/mm.ts";

/** Observation and navigation logs: u-blox, RINEX (named or by year, such as .26o), compressed RINEX and gzip. */
export const GNSS_LOG = /\.(ubx|obs|nav|rnx|crx|\d\d[ong]|gz)$/i;

export const isGnssLog = (name: string) => GNSS_LOG.test(name);

/** GNSS_LOG for a file picker, which takes extensions only: RINEX by year for 2020 to 2029. */
export const GNSS_ACCEPT = [".ubx", ".obs", ".nav", ".rnx", ".crx", ".gz", ...Array.from({ length: 10 }, (_, i) => 20 + i).flatMap((y) => [`.${y}o`, `.${y}n`, `.${y}g`])].join(",");

/** Where a log goes in a DGPS job: reference, base, or rover:<point id>. */
export interface GnssTarget {
  target: string;
  label: string;
}

export function gnssTargets(job: Pick<GnssJob, "reference" | "base" | "rovers">): GnssTarget[] {
  return [
    { target: "reference", label: `Reference · ${job.reference.name}` },
    ...(job.base ? [{ target: "base", label: `Base · ${job.base.point_id}` }] : []),
    ...job.rovers.map((r) => ({ target: `rover:${r.point_id}`, label: `${r.role === "check" ? "Check" : "GCP"} · ${r.point_id}` })),
  ];
}

/** A name as runs of letters and of digits, digits without leading zeros: "GCP_01.ubx" is gcp, 1. */
function runs(name: string): string[] {
  const stem = name.toLowerCase().replace(/\.(gz|zip)$/, "").replace(/\.[a-z0-9]+$/, "");
  return (stem.match(/[a-z]+|\d+/g) ?? []).map((r) => (/^\d/.test(r) ? r.replace(/^0+(?=\d)/, "") : r));
}

function contains(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((r, k) => haystack[i + k] === r)) return true;
  }
  return false;
}

// The planner names ground control G1, G2… and check points C1…; field crews often write gcp1 or cp1.
const PREFIX_ALIASES: Record<string, string[]> = { g: ["gcp"], c: ["cp", "chk", "check"] };

function pointForms(pointId: string): string[][] {
  const id = runs(pointId);
  const aliases = id.length === 2 && /^\d+$/.test(id[1]) ? (PREFIX_ALIASES[id[0]] ?? []).map((a) => [a, id[1]]) : [];
  return [id, ...aliases];
}

/** The target a log's name points to, or null when it names none: a rover's point id first, then "base", then the
 * reference station by its name, "cors" or "ref". */
export function matchTarget(fileName: string, job: Pick<GnssJob, "reference" | "base" | "rovers">): string | null {
  const name = runs(fileName);
  const rover = job.rovers.find((r) => pointForms(r.point_id).some((form) => contains(name, form)));
  if (rover) return `rover:${rover.point_id}`;
  if (job.base && (name.includes("base") || contains(name, runs(job.base.point_id)))) return "base";
  if (name.some((r) => r === "cors" || r === "ref" || r === "reference") || contains(name, runs(job.reference.name))) return "reference";
  return null;
}

/** Whether every target of the job has a log, counting ones already uploaded. */
export function everyTargetHasLogs(job: Pick<GnssJob, "reference" | "base" | "rovers">, adding: string[]): boolean {
  const has = (target: string, files: { uploaded: boolean }[]) => files.some((f) => f.uploaded) || adding.includes(target);
  return (
    has("reference", job.reference.files) &&
    (!job.base || has("base", job.base.files)) &&
    job.rovers.every((r) => has(`rover:${r.point_id}`, r.files))
  );
}
