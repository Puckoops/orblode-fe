import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CalcParamsError,
  DEFAULT_METHOD_STATE,
  STUCK_COMPUTE_MS,
  calcTypesFor,
  crossSurveyRefs,
  defaultKindFor,
  formatComputeElapsed,
  hasDesignBase,
  isComputeStuck,
  isVolumeKind,
  kindForCalcType,
  methodFromParams,
  planStatsNote,
  volumeParams,
  metricsOf,
  provenanceOf,
  resultErrorOf,
  surfaceRefsForMethod,
} from "../calc.ts";

test("kindForCalcType maps ids to backend kinds within the geometry mode", () => {
  assert.equal(kindForCalcType("stockpile", "polygon"), "stockpile");
  assert.equal(kindForCalcType("cut-fill", "polygon"), "cut_fill");
  assert.equal(kindForCalcType("area", "polygon"), "area");
  assert.equal(kindForCalcType("cross-section", "polyline"), "cross_section");
  assert.equal(kindForCalcType("length", "polyline"), "distance");
});

test("kindForCalcType rejects a stale pick from another geometry", () => {
  // A polygon pick must not leak onto a freshly drawn line (and vice versa).
  assert.equal(kindForCalcType("stockpile", "polyline"), null);
  assert.equal(kindForCalcType("cross-section", "polygon"), null);
  assert.equal(kindForCalcType(null, "polygon"), null);
});

test("calcTypesFor idle offers nothing; volume types flag needsBase", () => {
  assert.deepEqual(calcTypesFor("idle"), []);
  const polygon = calcTypesFor("polygon");
  assert.ok(polygon.find((t) => t.id === "stockpile")?.needsBase);
  assert.ok(polygon.find((t) => t.id === "cut-fill")?.needsBase);
  assert.equal(polygon.find((t) => t.id === "area")?.needsBase, undefined);
});

test("defaultKindFor is the panel's displayed default — saved kind == shown pick", () => {
  assert.equal(defaultKindFor("polygon"), "stockpile");
  assert.equal(defaultKindFor("polyline"), "distance");
});

test("isVolumeKind is exactly the kinds orblode-svc computes", () => {
  for (const k of ["volume", "stockpile", "cut_fill"]) assert.ok(isVolumeKind(k));
  for (const k of ["cross_section", "contour", "tin", "area", "distance", "elevation"]) assert.ok(!isVolumeKind(k));
});

test("smart-base emits the contract's stockpile pair (from=base, to=survey dsm)", () => {
  const { from, to } = surfaceRefsForMethod(DEFAULT_METHOD_STATE);
  assert.deepEqual(from, { type: "smart_base" });
  assert.deepEqual(to, { type: "survey_terrain", surface: "dsm" });
});

test("reference-rl custom requires an elevation and emits elevation_m", () => {
  assert.throws(
    () => surfaceRefsForMethod({ ...DEFAULT_METHOD_STATE, method: "reference-rl", refMode: "custom" }),
    CalcParamsError
  );
  const { from } = surfaceRefsForMethod({
    ...DEFAULT_METHOD_STATE,
    method: "reference-rl",
    refMode: "custom",
    refElevation: 72.5,
  });
  assert.deepEqual(from, { type: "reference_level", elevation_m: 72.5 });
});

test("reference-rl derive modes emit derive, never elevation_m (§3.1 XOR)", () => {
  for (const refMode of ["lowest_vertex", "highest_vertex"] as const) {
    const { from } = surfaceRefsForMethod({
      ...DEFAULT_METHOD_STATE,
      method: "reference-rl",
      refMode,
      refElevation: 99, // stale custom value must not leak into a derive ref
    });
    assert.deepEqual(from, { type: "reference_level", derive: refMode });
  }
});

test("methods orblode-svc does not compute are a guided error, never a payload", () => {
  for (const method of ["custom-base"]) {
    assert.throws(() => surfaceRefsForMethod({ ...DEFAULT_METHOD_STATE, method }), CalcParamsError, method);
  }
});

test("survey methods compare like surfaces and other-survey needs a pick", () => {
  const prev = surfaceRefsForMethod({ ...DEFAULT_METHOD_STATE, method: "previous-survey", surface: "dtm" });
  assert.deepEqual(prev, {
    from: { type: "previous_survey", surface: "dtm" },
    to: { type: "survey_terrain", surface: "dtm" },
  });
  assert.throws(() => surfaceRefsForMethod({ ...DEFAULT_METHOD_STATE, method: "other-survey" }), CalcParamsError);
  const other = surfaceRefsForMethod({ ...DEFAULT_METHOD_STATE, method: "other-survey", baseSurveyId: "s-1" });
  assert.deepEqual(other.from, { type: "survey_terrain", survey_id: "s-1", surface: "dsm" });
  assert.deepEqual(other.to, { type: "survey_terrain", surface: "dsm" });
});

test("design-surface needs a picked design and names it as the base", () => {
  assert.throws(() => surfaceRefsForMethod({ ...DEFAULT_METHOD_STATE, method: "design-surface" }), CalcParamsError);
  const refs = surfaceRefsForMethod({ ...DEFAULT_METHOD_STATE, method: "design-surface", baseDesignId: "d-1" });
  assert.deepEqual(refs, { from: { type: "design", design_id: "d-1" }, to: { type: "survey_terrain", surface: "dsm" } });
  assert.equal(hasDesignBase(refs), true);
  assert.equal(hasDesignBase({ from: { type: "previous_survey" } }), false);
  assert.equal(hasDesignBase(null), false);
});

test("crossSurveyRefs names both epochs on one surface", () => {
  assert.deepEqual(crossSurveyRefs("a", "b", "dtm"), {
    from: { type: "survey_terrain", survey_id: "a", surface: "dtm" },
    to: { type: "survey_terrain", survey_id: "b", surface: "dtm" },
  });
});

test("methodFromParams round-trips every emitted ref shape", () => {
  const cases = [
    { ...DEFAULT_METHOD_STATE, method: "smart-base" },
    { ...DEFAULT_METHOD_STATE, method: "reference-rl", refMode: "custom" as const, refElevation: 71.2 },
    { ...DEFAULT_METHOD_STATE, method: "reference-rl", refMode: "highest_vertex" as const },
    { ...DEFAULT_METHOD_STATE, method: "previous-survey", surface: "dtm" as const },
    { ...DEFAULT_METHOD_STATE, method: "other-survey", baseSurveyId: "s-9" },
    { ...DEFAULT_METHOD_STATE, method: "design-surface", baseDesignId: "d-2" },
  ];
  for (const state of cases) {
    const refs = surfaceRefsForMethod(state);
    const back = methodFromParams({ from: refs.from, to: refs.to });
    assert.ok(back, `round-trip lost ${state.method}`);
    assert.deepEqual(back, state);
  }
});

test("methodFromParams does not recover an incomplete base", () => {
  assert.equal(methodFromParams({ from: { type: "design" } }), null);
  assert.equal(methodFromParams({ from: { type: "survey_terrain", surface: "dsm" } }), null);
});

test("methodFromParams falls back to legacy volume_method, else null", () => {
  assert.equal(methodFromParams({ volume_method: "reference-rl" })?.method, "reference-rl");
  assert.equal(methodFromParams({}), null);
  assert.equal(methodFromParams(null), null);
});

test("metricsOf reads the v1 doc's nested metrics and drops the envelope", () => {
  const doc = {
    version: 1,
    semantics: "cut_fill_v1",
    metrics: { cut_volume_m3: 0.54, fill_volume_m3: 581.89, net_change_m3: 581.35, samples: 28052 },
    provenance: { processor: "volume-compute" },
  };
  const m = metricsOf(doc);
  assert.equal(m.net_change_m3, 581.35);
  assert.equal(m.version, undefined); // the "Version 1" leak, fixed
  assert.equal(Object.keys(m).length, 4);
});

test("metricsOf keeps legacy flat maps working (minus version)", () => {
  const m = metricsOf({ area_m2: 421.3, perimeter_m: 80, version: 1 });
  assert.deepEqual(m, { area_m2: 421.3, perimeter_m: 80 });
  assert.deepEqual(metricsOf(null), {});
});

test("resultErrorOf and provenanceOf expose failure reason and receipt", () => {
  const failed = { version: 1, error: { class: "params_invalid", message: "boundary outside grid" } };
  assert.deepEqual(resultErrorOf(failed), { class: "params_invalid", message: "boundary outside grid" });
  assert.equal(resultErrorOf({ version: 1 }), null);

  const prov = provenanceOf({ version: 1, provenance: { processor: "volume-compute", tools: { gdal: "3.8" } } });
  assert.equal(prov?.processor, "volume-compute");
  assert.equal(provenanceOf({ version: 1 }), null);
});

test("methodsForKind offers survey bases only for cut/fill", async () => {
  const { methodsForKind, defaultMethodForKind } = await import("../calc.ts");
  for (const kind of ["volume", "stockpile"]) {
    assert.deepEqual(methodsForKind(kind).map((m) => m.id), ["smart-base", "reference-rl"], kind);
  }
  assert.deepEqual(methodsForKind("cut_fill").map((m) => m.id), ["smart-base", "reference-rl", "previous-survey", "other-survey", "design-surface"]);
  assert.deepEqual(methodsForKind("area"), []); // non-volume: no base methods
  assert.deepEqual(methodsForKind("cross_section"), []);
  assert.equal(defaultMethodForKind("stockpile"), "smart-base");
  assert.equal(defaultMethodForKind("cut_fill"), "smart-base");
  assert.equal(defaultMethodForKind("distance"), null);
});

test("coerceMethodForKind snaps foreign methods to the kind's default", async () => {
  const { coerceMethodForKind } = await import("../calc.ts");
  const smart = { ...DEFAULT_METHOD_STATE, method: "smart-base" };
  assert.equal(coerceMethodForKind(smart, "stockpile").method, "smart-base");
  assert.equal(coerceMethodForKind(smart, "cut_fill").method, "smart-base");
  // A survey base stays on cut/fill and snaps on a stockpile; a method this app
  // no longer offers (read back from a stored row) snaps everywhere.
  const previous = { ...DEFAULT_METHOD_STATE, method: "previous-survey" };
  assert.equal(coerceMethodForKind(previous, "cut_fill").method, "previous-survey");
  assert.equal(coerceMethodForKind(previous, "stockpile").method, "smart-base");
  const custom = { ...DEFAULT_METHOD_STATE, method: "custom-base" };
  assert.equal(coerceMethodForKind(custom, "cut_fill").method, "smart-base");
  assert.equal(coerceMethodForKind(smart, "area").method, "smart-base");
});

test("resultForKind: map hit, map miss, legacy fallback", async () => {
  const { resultForKind } = await import("../calc.ts");
  const spDoc = { version: 1, metrics: { volume_m3: 581 } };
  const cfDoc = { version: 1, metrics: { net_change_m3: -42 } };
  // Map hit: each kind sees ITS doc.
  const m = { kind: "stockpile", results: { stockpile: spDoc, cut_fill: cfDoc } };
  assert.equal(resultForKind(m), spDoc);
  assert.equal(resultForKind({ ...m, kind: "cut_fill" }), cfDoc);
  // Map miss with OTHER kinds computed → null (this type not computed yet).
  assert.equal(resultForKind({ kind: "area", results: { stockpile: spDoc } }), null);
  // Legacy row (no map): the single result attributes to the current kind.
  assert.equal(resultForKind({ kind: "stockpile", result: spDoc }), spDoc);
  // Nothing anywhere → null.
  assert.equal(resultForKind({ kind: "stockpile" }), null);
});

const STUCK_NOW = Date.parse("2026-07-28T12:00:00Z");
const minutesAgo = (n: number) => STUCK_NOW - n * 60_000;

test("STUCK_COMPUTE_MS outlasts the daemon's 10-minute compute and precedes its 20-minute reaper", () => {
  assert.equal(STUCK_COMPUTE_MS, 15 * 60_000);
});

test("isComputeStuck only fires for the computing status", () => {
  for (const status of ["draft", "completed", "failed"]) {
    assert.equal(
      isComputeStuck({ status, updated_at: minutesAgo(60) }, STUCK_NOW),
      false,
      `${status} must never be reported as stuck`
    );
  }
});

test("isComputeStuck is false for a compute still inside the threshold", () => {
  assert.equal(isComputeStuck({ status: "computing", updated_at: minutesAgo(1) }, STUCK_NOW), false);
  // Exactly at the boundary is not yet stuck (strict >).
  assert.equal(isComputeStuck({ status: "computing", updated_at: minutesAgo(15) }, STUCK_NOW), false);
});

test("isComputeStuck is true once past the threshold", () => {
  assert.equal(isComputeStuck({ status: "computing", updated_at: minutesAgo(16) }, STUCK_NOW), true);
  assert.equal(isComputeStuck({ status: "computing", updated_at: minutesAgo(600) }, STUCK_NOW), true);
});

test("isComputeStuck tolerates a missing or non-finite timestamp", () => {
  assert.equal(isComputeStuck({ status: "computing" }, STUCK_NOW), false);
  assert.equal(isComputeStuck({ status: "computing", updated_at: Number.NaN }, STUCK_NOW), false);
  assert.equal(isComputeStuck({ status: "computing", updated_at: 0 }, STUCK_NOW), false);
});

test("isComputeStuck never fires on a future stamp (server clock ahead)", () => {
  assert.equal(isComputeStuck({ status: "computing", updated_at: minutesAgo(-30) }, STUCK_NOW), false);
});

test("formatComputeElapsed renders minutes then hours, floored at 1 min", () => {
  assert.equal(formatComputeElapsed({ updated_at: minutesAgo(4) }, STUCK_NOW), "4 min");
  assert.equal(formatComputeElapsed({ updated_at: minutesAgo(59) }, STUCK_NOW), "59 min");
  assert.equal(formatComputeElapsed({ updated_at: minutesAgo(75) }, STUCK_NOW), "1 hr");
  assert.equal(formatComputeElapsed({ updated_at: minutesAgo(0) }, STUCK_NOW), "1 min");
  assert.equal(formatComputeElapsed({}, STUCK_NOW), "a while");
  assert.equal(formatComputeElapsed({ updated_at: Number.NaN }, STUCK_NOW), "a while");
});

test("volumeParams names the material, and clears it with an empty id", () => {
  const withMaterial = volumeParams({ ...DEFAULT_METHOD_STATE, materialId: "m1" });
  assert.equal(withMaterial.material_id, "m1");
  assert.deepEqual(withMaterial.from, { type: "smart_base" });
  assert.equal(volumeParams(DEFAULT_METHOD_STATE).material_id, "");
  assert.equal(methodFromParams(withMaterial)?.materialId, "m1");
  assert.equal(methodFromParams({ ...withMaterial, material_id: "" })?.materialId, null);
});

test("planStatsNote says a saved slope has no grade, and only volumes offer compute", () => {
  assert.match(planStatsNote("slope"), /grade shows only while drawing/);
  assert.match(planStatsNote("stockpile"), /run compute/);
  assert.doesNotMatch(planStatsNote("area"), /compute/);
});
