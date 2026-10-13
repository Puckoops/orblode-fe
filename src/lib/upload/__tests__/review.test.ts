import assert from "node:assert/strict";
import { test } from "node:test";

import type { Detection, SourceAsset } from "@/lib/api/orblodeSvc";
import { buildProcessorPlan, type FileRole } from "../planner.ts";
import {
  DETECTION_STALE_AFTER_MS,
  buildReviewRows,
  canProcess,
  crsChoices,
  crsSourceLabel,
  fileWarnings,
  plannedFiles,
  reviewPatches,
  rowsMissingCrs,
  siteCrsFrom,
  type ReviewEntry,
  type RowEdit,
} from "../review.ts";

const NOW = 1_791_888_100_000;

const detection = (over: Partial<Detection> = {}): Detection => ({
  status: "done",
  requested_at: NOW - 5_000,
  inspected_at: NOW - 2_000,
  warnings: [],
  ...over,
});

const asset = (filename: string, over: Partial<SourceAsset> = {}): SourceAsset => ({
  id: `a-${filename}`,
  client_id: "c1",
  survey_id: "s1",
  kind: "vector",
  role: "vector",
  url: `gs://b/orblode/clients/c1/original/s1/${filename}`,
  filename,
  status: "registered",
  ...over,
});

const entry = (a: SourceAsset, queuedRole: FileRole, roleByHand = false): ReviewEntry => ({ asset: a, queuedRole, roleByHand });

const rows = (entries: ReviewEntry[], edits: Record<string, RowEdit> = {}, now = NOW) => buildReviewRows(entries, edits, "preprocessed", now);

const MGA56 = { epsg: "EPSG:28356", name: "GDA94 / MGA zone 56", confidence: "high" as const };

const mineSite = () => [
  entry(
    asset("Mine_Site_GeoTIFF_DSM_GDA94_MGA_zone_56.tiff", {
      kind: "terrain",
      role: "dsm",
      crs: "EPSG:28356",
      vertical_datum: "AHD",
      detection: detection({ class: "raster", crs: { ...MGA56, source: "header" }, suggested_role: "dsm" }),
    }),
    "dsm"
  ),
  entry(
    asset("Mine_Site_LAZ.laz", {
      kind: "pointcloud",
      role: "pointcloud",
      crs: "EPSG:28356",
      detection: detection({ class: "pointcloud", crs: { ...MGA56, source: "header" }, suggested_role: "pointcloud" }),
    }),
    "pointcloud"
  ),
  entry(
    asset("Mine_Site_DXF_Contours_1_unit.zip", {
      crs: "EPSG:28356",
      detection: detection({ class: "vector", format: "ZIP", crs: { ...MGA56, source: "sibling" }, suggested_role: "contours" }),
    }),
    "vector"
  ),
  entry(
    asset("Mine_Site_Polygons_of_interest.json", {
      crs: "EPSG:4326",
      detection: detection({ class: "vector", crs: { epsg: "EPSG:4326", name: "WGS 84", confidence: "high", source: "header" }, suggested_role: "vector" }),
    }),
    "vector"
  ),
  entry(
    asset("Mine_Site_JFIF_JPEG_ortho.zip", {
      kind: "ortho",
      role: "ortho",
      detection: detection({ class: "image", format: "ZIP", suggested_role: "", skip_reason: "photos, not a map layer — stored but not processed" }),
    }),
    "ortho"
  ),
];

test("the server's suggested role replaces the name guess, the CRS shows where it came from", () => {
  const [dsm, laz, contours, json, jpegs] = rows(mineSite());
  assert.equal(contours.role, "contours");
  assert.equal(contours.crs, "EPSG:28356");
  assert.equal(contours.crsSource, "from other files");
  assert.equal(dsm.crsSource, "from file");
  assert.equal(laz.crsSource, "from file");
  assert.equal(json.crsSource, "from file");
  assert.equal(dsm.verticalDatum, "AHD");
  assert.equal(jpegs.role, "ortho");
  assert.equal(jpegs.skipReason, "photos, not a map layer — stored but not processed");
  assert.equal(dsm.skipReason, null);
});

test("a role picked by hand, in the queue or in the review, beats the suggestion", () => {
  const a = asset("pit_surface.tif", { kind: "terrain", role: "dtm", detection: detection({ suggested_role: "dsm" }) });
  assert.equal(rows([entry(a, "dtm", true)])[0].role, "dtm");
  assert.equal(rows([entry(a, "dtm")], { [a.id]: { role: "ortho" } })[0].role, "ortho");
  assert.equal(rows([entry(a, "dtm")])[0].role, "dsm");
});

test("a suggestion this data type doesn't offer leaves the queued role", () => {
  const a = asset("design.dxf", { detection: detection({ suggested_role: "contours" }) });
  assert.equal(buildReviewRows([entry(a, "design")], {}, "design", NOW)[0].role, "design");
});

test("without a resolved CRS the upload's fallback applies, marked assumed", () => {
  const a = asset("haul.dxf", { declared_crs: "EPSG:7856", detection: detection({ status: "unavailable" }) });
  const [row] = rows([entry(a, "vector")]);
  assert.equal(row.crs, "EPSG:7856");
  assert.equal(row.crsSource, "assumed");
  assert.deepEqual(row.notes, ["The file reader didn't answer, so nothing was read from the file"]);
});

test("each CRS source reads as its chip", () => {
  const cases: [Partial<SourceAsset>, string | null][] = [
    [{ crs: "EPSG:4326", detection: detection({ crs: { epsg: "EPSG:4326", source: "format", confidence: "high" } }) }, "from file"],
    [{ crs: "EPSG:28356", detection: detection({ crs: { epsg: "EPSG:28356", source: "previous", confidence: "high" } }) }, "from earlier surveys"],
    [{ crs: "EPSG:28356", detection: detection({ crs: { epsg: "EPSG:28356", source: "site", confidence: "medium" } }) }, "from the site's location"],
    [{ crs: "EPSG:4326", detection: detection({ crs: { epsg: "EPSG:4326", source: "range", confidence: "medium" } }) }, "assumed"],
    [{ crs: "EPSG:4326", declared_crs: "EPSG:4326", detection: detection({ crs: { epsg: "EPSG:4326", source: "declared", confidence: "low" } }) }, "assumed"],
    [{ crs: "EPSG:7856", detection: detection({ crs: { epsg: "EPSG:7856", source: "user", confidence: "high" } }) }, "you"],
    [{ crs: "EPSG:7856" }, null],
    [{ detection: detection() }, null],
  ];
  for (const [over, label] of cases) assert.equal(crsSourceLabel(asset("f.tif", over)), label, JSON.stringify(over));
  assert.equal(crsSourceLabel(asset("f.tif", { crs: "EPSG:28356" }), "EPSG:7856"), "you");
});

test("rows still inspecting block Process until they finish or go stale, unless the person skips waiting", () => {
  const reading = asset("dsm.tif", { kind: "terrain", role: "dsm", declared_crs: "EPSG:28356", detection: detection({ status: "inspecting", requested_at: NOW - 10_000 }) });
  const fresh = rows([entry(reading, "dsm")]);
  assert.equal(fresh[0].inspecting, true);
  assert.equal(fresh[0].detectAgain, false);
  assert.equal(canProcess(fresh, false), false);
  assert.equal(canProcess(fresh, true), true);

  const later = rows([entry(reading, "dsm")], {}, NOW - 10_000 + DETECTION_STALE_AFTER_MS + 1);
  assert.equal(later[0].inspecting, false);
  assert.equal(later[0].stale, true);
  assert.equal(later[0].detectAgain, true);
  assert.deepEqual(later[0].notes, ["Still reading after two minutes"]);
  assert.equal(canProcess(later, false), true);
});

test("failed and unavailable reads offer Detect again; a finished one doesn't", () => {
  const [failed, unavailable, done] = rows([
    entry(asset("a.tif", { detection: detection({ status: "failed", error: "not a TIFF" }) }), "dsm"),
    entry(asset("b.tif", { detection: detection({ status: "unavailable" }) }), "dsm"),
    entry(asset("c.tif", { detection: detection() }), "dsm"),
  ]);
  assert.equal(failed.detectAgain, true);
  assert.deepEqual(failed.notes, ["Couldn't read the file: not a TIFF"]);
  assert.equal(unavailable.detectAgain, true);
  assert.equal(done.detectAgain, false);
});

test("every processed file needs a CRS; stored-only files don't", () => {
  const noCrs = asset("contours.dxf", { detection: detection({ suggested_role: "contours" }) });
  const mesh = asset("site.ttm", { kind: "site_model", role: "site_model", detection: detection({ class: "mesh", suggested_role: "site_model" }) });
  const blocked = rows([entry(noCrs, "contours"), entry(mesh, "site_model")]);
  assert.deepEqual(
    rowsMissingCrs(blocked).map((r) => r.name),
    ["contours.dxf"]
  );
  assert.equal(canProcess(blocked, true), false);
  assert.equal(canProcess(rows([entry(noCrs, "contours"), entry(mesh, "site_model")], { [noCrs.id]: { crs: "EPSG:28356" } }), false), true);
  assert.equal(canProcess([], true), false);
});

test("patches carry a changed role with its kind, and only hand-picked CRS and datum", () => {
  const entries = mineSite();
  const contours = entries[2].asset;
  const dsm = entries[0].asset;
  const fallback = asset("haul.dxf", { declared_crs: "EPSG:28356", declared_vertical_datum: "AHD" });
  const edits = { [dsm.id]: { crs: "EPSG:7856", verticalDatum: "EGM2008" } };
  const patches = reviewPatches(rows([...entries, entry(fallback, "vector")], edits), edits);
  assert.deepEqual(patches, [
    { assetId: dsm.id, name: dsm.filename, patch: { crs: "EPSG:7856", vertical_datum: "EGM2008" } },
    { assetId: contours.id, name: contours.filename, patch: { role: "contours", kind: "vector" } },
  ]);
});

test("once the saved assets come back, nothing is patched again", () => {
  const a = asset("pit.tif", { kind: "terrain", role: "dsm", crs: "EPSG:28356", detection: detection({ suggested_role: "dtm" }) });
  const edits = { [a.id]: { crs: "EPSG:7856" } };
  assert.equal(reviewPatches(rows([entry(a, "dsm")], edits), edits).length, 1);
  const saved = { ...a, role: "dtm", kind: "terrain", crs: "EPSG:7856" };
  assert.deepEqual(reviewPatches(rows([entry(saved, "dsm")], edits), edits), []);
});

test("each file dispatches in its own CRS", () => {
  const plan = buildProcessorPlan(plannedFiles(rows(mineSite())), { epsg: "" });
  const vector = plan.dispatches.find((d) => d.request.processor_type === "vector-features");
  assert.deepEqual(vector?.request.inputs, [
    { url: "gs://b/orblode/clients/c1/original/s1/Mine_Site_DXF_Contours_1_unit.zip", kind: "vector", crs: "EPSG:28356" },
    { url: "gs://b/orblode/clients/c1/original/s1/Mine_Site_Polygons_of_interest.json", kind: "vector", crs: "EPSG:4326" },
  ]);
  const terrain = plan.dispatches.find((d) => d.request.processor_type === "terrain-quantized-mesh");
  assert.equal(terrain?.request.inputs?.[0].crs, "EPSG:28356");
  assert.deepEqual(
    plan.skips.map((s) => s.filename),
    ["Mine_Site_JFIF_JPEG_ortho.zip"]
  );
});

test("warnings and read notes go to the done summary by file", () => {
  const warned = asset("contours.dxf", {
    crs: "EPSG:28356",
    detection: detection({ crs: { epsg: "EPSG:28356", source: "sibling", confidence: "medium" }, warnings: ["Tagged EPSG:4326, but its coordinates are in metres"] }),
  });
  assert.deepEqual(fileWarnings(rows([...mineSite(), entry(warned, "contours")])), [
    { filename: "contours.dxf", warnings: ["Tagged EPSG:4326, but its coordinates are in metres"] },
  ]);
});

test("the CRS list adds the detected code by name, its alternatives and the current pick", () => {
  const a = asset("x.tif", {
    detection: detection({ crs: { epsg: "EPSG:2193", name: "NZGD2000 / New Zealand Transverse Mercator 2000", source: "header", confidence: "high", candidates: ["EPSG:28356", "EPSG:9999"] } }),
  });
  const extra = crsChoices(a, "EPSG:1234").filter((o) => !o.label.includes("Zone") && !o.value.endsWith("4326"));
  assert.deepEqual(extra, [
    { value: "EPSG:2193", label: "NZGD2000 / New Zealand Transverse Mercator 2000 (EPSG:2193)" },
    { value: "EPSG:9999", label: "EPSG:9999" },
    { value: "EPSG:1234", label: "EPSG:1234" },
  ]);
});

test("a new site takes the projected CRS most of its files resolved to", () => {
  assert.deepEqual(siteCrsFrom(rows(mineSite())), { epsg: "EPSG:28356", label: "GDA94 / MGA zone 56" });
  const geographicOnly = rows([entry(asset("a.geojson", { crs: "EPSG:4326" }), "vector"), entry(asset("b.kml", { crs: "EPSG:4283" }), "vector")]);
  assert.equal(siteCrsFrom(geographicOnly), null);
  const fallbackOnly = rows([entry(asset("a.dxf", { declared_crs: "EPSG:7856" }), "vector")]);
  assert.deepEqual(siteCrsFrom(fallbackOnly), { epsg: "EPSG:7856", label: "GDA2020 / MGA Zone 56" });
});
