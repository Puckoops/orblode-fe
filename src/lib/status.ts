import type { ChipTone, GlyphShape } from "@puckoops/camelot";

export interface StateStyle {
  label: string;
  tone: ChipTone;
  glyph: GlyphShape;
}

const humanize = (value: string) => {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Unknown";
};

/** A project's lifecycle_status; GEOID only ever showed "active" specially. */
export function lifecycleState(status: string | null | undefined): StateStyle {
  switch (status) {
    case "active":
      return { label: "Active", tone: "teal", glyph: "check" };
    case "archived":
    case "closed":
    case "completed":
      return { label: humanize(status), tone: "neutral", glyph: "square" };
    default:
      return { label: humanize(status ?? ""), tone: "amber", glyph: "circle-half" };
  }
}

/** A survey's lifecycle status (asset-svc survey.Status plus the processing states). */
export function surveyState(status: string | null | undefined): StateStyle {
  const s = (status ?? "").toLowerCase();
  if (s === "completed" || s === "approved" || s === "ready" || s === "published") return { label: humanize(s), tone: "teal", glyph: "check" };
  if (s === "locked") return { label: "Locked", tone: "neutral", glyph: "square-filled" };
  if (s === "ready_to_approve") return { label: humanize(s), tone: "amber", glyph: "diamond" };
  if (s === "failed" || s === "error" || s === "rejected") return { label: humanize(s), tone: "red", glyph: "triangle" };
  if (s === "processing" || s === "ingesting" || s === "uploading" || s === "running" || s === "computing")
    return { label: humanize(s), tone: "blue", glyph: "circle-half" };
  return { label: humanize(s), tone: "amber", glyph: "circle-dashed" };
}

/** A measurement's compute status: draft | computing | completed | failed. */
export function measurementState(status: string | null | undefined): StateStyle {
  switch (status) {
    case "completed":
      return { label: "Computed", tone: "teal", glyph: "check" };
    case "computing":
      return { label: "Computing", tone: "blue", glyph: "circle-half" };
    case "failed":
      return { label: "Failed", tone: "red", glyph: "triangle" };
    default:
      return { label: "Not computed", tone: "neutral", glyph: "circle-dashed" };
  }
}

/** A source asset still waiting for its bytes. */
export const PENDING_UPLOAD: StateStyle = { label: "Pending", tone: "amber", glyph: "circle-dashed" };

/** A source asset whose file or settings changed since its outputs were built. */
export const NEEDS_REPROCESSING: StateStyle = { label: "Needs reprocessing", tone: "amber", glyph: "redo" };

/** One queued upload row on the upload page. */
export const UPLOAD_ROW: Record<"uploading" | "uploaded" | "error", StateStyle> = {
  uploading: { label: "Uploading", tone: "blue", glyph: "circle-half" },
  uploaded: { label: "Done", tone: "teal", glyph: "check" },
  error: { label: "Failed", tone: "red", glyph: "triangle" },
};

/** A stockpile's place in the inventory: whether its numbers match its outline. */
export function pileState(state: string | null | undefined): StateStyle {
  switch (state) {
    case "computed":
      return { label: "Computed", tone: "teal", glyph: "check" };
    case "stale":
      return { label: "Edited since", tone: "amber", glyph: "circle-half" };
    case "computing":
      return { label: "Computing", tone: "blue", glyph: "circle-half" };
    case "failed":
      return { label: "Failed", tone: "red", glyph: "triangle" };
    default:
      return { label: "Not computed", tone: "neutral", glyph: "circle-dashed" };
  }
}

/** A reconciliation variance against its thresholds. */
export function varianceState(status: string | null | undefined): StateStyle {
  switch (status) {
    case "green":
      return { label: "Within", tone: "teal", glyph: "check" };
    case "amber":
      return { label: "Watch", tone: "amber", glyph: "diamond" };
    case "red":
      return { label: "Outside", tone: "red", glyph: "triangle" };
    default:
      return { label: "No balance", tone: "neutral", glyph: "circle-dashed" };
  }
}

/** A survey whose newest run of some processor failed, beside its own status. */
export const PROCESSING_FAILED: StateStyle = { label: "Processing failed", tone: "red", glyph: "triangle" };
