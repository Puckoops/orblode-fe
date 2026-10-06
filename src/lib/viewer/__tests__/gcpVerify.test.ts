import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TOLERANCE_M,
  buildGcpVerifyRequest,
  clampTolerance,
  failingMarks,
  gcpSourceLayer,
  gcpVerificationLayer,
  parseMarks,
  readVerdict,
  uncoveredMarks,
  verdictLevel,
  verdictSummary,
  type GcpVerdict,
} from "../gcpVerify.ts";

// Minimal structural stand-ins — the module only reads these shapes.
const layer = (role: string, properties?: Record<string, unknown>) =>
  ({ role, geojson_url: `gs://b/${role}.geojson`, feature_count: 3, properties }) as never;

const manifest = (vectors: unknown[]) =>
  ({ layers: { vectors } }) as never;

const verdict = (over: Partial<GcpVerdict> = {}): GcpVerdict => ({
  axis: "vertical",
  toleranceM: 0.01,
  passed: true,
  total: 5,
  checked: 5,
  withinTolerance: 5,
  rmseM: 0.003,
  meanResidualM: 0.001,
  stdDevM: 0.002,
  maxAbsResidualM: 0.006,
  ...over,
});

test("buildGcpVerifyRequest matches the deployed gcp-verify v1 schema", () => {
  const req = buildGcpVerifyRequest({
    sourceUrl: "gs://bucket/dsm.tif",
    crs: "EPSG:32756",
    gcpsUrl: "gs://bucket/gcps.geojson",
    toleranceM: 0.01,
  });
  assert.equal(req.processor_type, "gcp-verify");
  assert.equal(req.version, "v1");
  assert.deepEqual(req.payload, {
    source: { url: "gs://bucket/dsm.tif", kind: "terrain", crs: "EPSG:32756" },
    gcps: { url: "gs://bucket/gcps.geojson", kind: "vector" },
    tolerance_m: 0.01,
  });
  // Both artifacts must be declared as inputs or the tenant-ownership guard
  // has nothing to verify them against.
  assert.equal(req.inputs?.length, 2);
});

test("buildGcpVerifyRequest omits crs when the manifest has none", () => {
  const req = buildGcpVerifyRequest({
    sourceUrl: "gs://b/dsm.tif",
    gcpsUrl: "gs://b/gcps.geojson",
  });
  assert.equal("crs" in (req.payload!.source as object), false);
  assert.equal((req.payload as Record<string, unknown>).tolerance_m, DEFAULT_TOLERANCE_M);
});

test("clampTolerance keeps the threshold usable", () => {
  assert.equal(clampTolerance(0.01), 0.01);
  assert.equal(clampTolerance(0.5), 0.5);
  // Zero or negative would fail every mark.
  assert.equal(clampTolerance(0), DEFAULT_TOLERANCE_M);
  assert.equal(clampTolerance(-1), DEFAULT_TOLERANCE_M);
  assert.equal(clampTolerance(NaN), DEFAULT_TOLERANCE_M);
  // Past 10 m it stops being an alignment check.
  assert.equal(clampTolerance(1000), 10);
});

test("layer lookups find the right roles and tolerate an empty manifest", () => {
  const m = manifest([layer("contours"), layer("gcps"), layer("gcp_verification", {})]);
  assert.equal(gcpSourceLayer(m)?.role, "gcps");
  assert.equal(gcpVerificationLayer(m)?.role, "gcp_verification");
  assert.equal(gcpSourceLayer(manifest([])), null);
  assert.equal(gcpVerificationLayer(null), null);
});

test("readVerdict pulls the summary out of the manifest properties bag", () => {
  const v = readVerdict(
    layer("gcp_verification", {
      axis: "vertical",
      tolerance_m: 0.01,
      passed: true,
      total: 8,
      checked: 7,
      within_tolerance: 7,
      rmse_m: 0.004,
      mean_residual_m: -0.001,
      std_dev_m: 0.003,
      max_abs_residual_m: 0.008,
    })
  );
  assert.ok(v);
  assert.equal(v.passed, true);
  assert.equal(v.total, 8);
  assert.equal(v.checked, 7); // one mark uncovered
  assert.equal(v.rmseM, 0.004);
});

test("readVerdict never reads a missing `passed` as a green result", () => {
  const v = readVerdict(
    layer("gcp_verification", { tolerance_m: 0.01, total: 3, checked: 3 })
  );
  assert.ok(v);
  assert.equal(v.passed, false);
  // Truthy-but-not-true must not pass either.
  const v2 = readVerdict(
    layer("gcp_verification", { tolerance_m: 0.01, total: 3, checked: 3, passed: "yes" })
  );
  assert.equal(v2?.passed, false);
});

test("readVerdict returns null rather than a half-read verdict", () => {
  assert.equal(readVerdict(null), null);
  assert.equal(readVerdict(layer("gcp_verification")), null);
  // Missing the fields that make the numbers mean anything.
  assert.equal(readVerdict(layer("gcp_verification", { passed: true })), null);
});

test("verdictLevel separates a coverage gap from a residual failure", () => {
  assert.equal(verdictLevel(verdict()), "pass");
  assert.equal(verdictLevel(verdict({ passed: false, withinTolerance: 3 })), "fail");
  // Nothing sampled is neither — calling it "failed" sends a surveyor hunting
  // for an alignment problem that doesn't exist.
  assert.equal(verdictLevel(verdict({ checked: 0, passed: false })), "no-coverage");
});

test("verdictSummary calls out a datum-style offset separately from scatter", () => {
  // Bias well above tolerance and dominating the spread → datum mismatch.
  const offset = verdictSummary(
    verdict({ passed: false, withinTolerance: 0, meanResidualM: 0.42, stdDevM: 0.004 })
  );
  assert.match(offset, /datum/i);
  assert.match(offset, /0\.420/);

  // Comparable bias and spread → genuine scatter, not an offset.
  const scattered = verdictSummary(
    verdict({ passed: false, withinTolerance: 1, meanResidualM: 0.005, stdDevM: 0.4 })
  );
  assert.doesNotMatch(scattered, /datum/i);
  assert.match(scattered, /scattered/i);
});

test("verdictSummary states the passing and no-coverage cases plainly", () => {
  assert.match(verdictSummary(verdict()), /within ±0\.01 m/);
  assert.match(verdictSummary(verdict({ checked: 0 })), /no coverage/i);
});

const REPORT = {
  type: "FeatureCollection",
  stats: { checked: 3 },
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [151.1, -33.8, 100] },
      properties: {
        id: "G1", z_gcp: 100, z_surface: 100.002, residual_m: 0.002,
        checked: true, within_tolerance: true,
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [151.2, -33.8, 105] },
      properties: {
        id: "G2", z_gcp: 105, z_surface: 105.5, residual_m: 0.5,
        checked: true, within_tolerance: false,
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [151.3, -33.8, 110] },
      properties: {
        id: "G3", z_gcp: 110, z_surface: null, residual_m: null,
        checked: false, within_tolerance: false,
      },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [151.4, -33.8, 120] },
      properties: {
        id: "G4", z_gcp: 120, z_surface: 118, residual_m: -2,
        checked: true, within_tolerance: false,
      },
    },
  ],
};

test("parseMarks reads the FeatureCollection into marks", () => {
  const marks = parseMarks(REPORT);
  assert.ok(marks);
  assert.equal(marks.length, 4);
  assert.equal(marks[0].id, "G1");
  assert.equal(marks[0].zSurface, 100.002);
  // An uncovered mark keeps a null surface height, not a zero.
  assert.equal(marks[2].zSurface, null);
  assert.equal(marks[2].checked, false);
});

test("parseMarks rejects malformed documents and unplottable features", () => {
  assert.equal(parseMarks(null), null);
  assert.equal(parseMarks({}), null);
  assert.equal(parseMarks({ features: "nope" }), null);
  // A feature with no usable position can't be drawn or listed.
  assert.equal(parseMarks({ features: [{ type: "Feature", geometry: {} }] }), null);
});

test("failingMarks is worst-first and excludes coverage gaps", () => {
  const marks = parseMarks(REPORT)!;
  const failing = failingMarks(marks);
  assert.deepEqual(
    failing.map((m) => m.id),
    ["G4", "G2"] // |−2| then |0.5|; G3 is a gap, G1 passed
  );
});

test("uncoveredMarks reports the coverage gap separately", () => {
  const marks = parseMarks(REPORT)!;
  assert.deepEqual(
    uncoveredMarks(marks).map((m) => m.id),
    ["G3"]
  );
});
