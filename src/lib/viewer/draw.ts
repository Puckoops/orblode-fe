import type { Measurement } from "@/lib/api/orblodeSvc";

export type DrawMode = "polygon" | "polyline";

/** Preset carried by a draw tool: backend kind, compute params, target folder,
 * palette label, whether the polyline readout should report a grade (slope
 * tool), and the namespaced key of the toolbar button that launched it (so
 * exactly that one button highlights — multiple toolbars are on screen at
 * once).
 *
 * `params` carries pre-filled SurfaceRefs so a template lands its compute
 * inputs at draw time (template seam, viewer-shell §3.3/§4.3). */
export interface DrawOptions {
  kind?: Measurement["kind"];
  params?: Record<string, unknown>;
  folder?: string;
  label?: string;
  slope?: boolean;
  toolKey?: string;
}
