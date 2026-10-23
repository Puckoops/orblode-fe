// Whether a volume measurement's stored numbers match its inputs. orblode-svc
// sends `result_state`; older builds don't, so it is worked out here the same
// way: only geometry, kind and compute params (inputs_updated_at) or a surface
// change stale a result, never a rename, folder move or draft toggle.

import type { Measurement, ResultState } from "@/lib/api/orblodeSvc";

import { isVolumeKind } from "./calc.ts";

type Stamped = Pick<Measurement, "kind" | "status" | "computed_at" | "updated_at" | "inputs_updated_at" | "result_state">;

/** When the compute inputs last changed. Rows saved before inputs_updated_at
 * existed fall back to updated_at, as orblode-svc does. */
export function inputsChangedAt(m: Pick<Measurement, "updated_at" | "inputs_updated_at">): number {
  return m.inputs_updated_at || m.updated_at || 0;
}

/** fresh | stale | missing | computing | failed for a volume kind, else null. */
export function resultStateOf(m: Stamped): ResultState | null {
  if (!isVolumeKind(m.kind)) return null;
  if (m.result_state) return m.result_state;
  if (m.status === "computing") return "computing";
  if (m.status === "failed") return "failed";
  if (!m.computed_at) return "missing";
  return inputsChangedAt(m) > m.computed_at ? "stale" : "fresh";
}
