import assert from "node:assert/strict";
import { test } from "node:test";

import type { SourceAsset, Survey } from "@/lib/api/orblodeSvc";
import { assetRole, isSurveyEditable, reprocessPlan, surveyDetailsOf, surveyDetailsPatch, surveySourceCrs } from "../edit.ts";

const survey = (over: Partial<Survey> = {}): Survey => ({
  id: "s1",
  client_id: "c1",
  project_id: "p1",
  survey_date: "2026-09-30",
  survey_type: "preprocessed",
  status: "processing",
  working_crs: "EPSG:4326",
  vertical_datum: "EGM2008",
  metadata: { dataset_name: "North pit — 30 Sep 2026", tags: ["pit"], source: "platform-upload", source_crs: "EPSG:7856" },
  created_at: 1,
  updated_at: 1_759_000_000_000,
  ...over,
});

const asset = (id: string, role: string, over: Partial<SourceAsset> = {}): SourceAsset => ({
  id,
  client_id: "c1",
  survey_id: "s1",
  kind: "terrain",
  role,
  url: `gs://b/original/s1/${id}`,
  filename: id,
  status: "registered",
  ...over,
});

test("only pending, processing, ready-to-approve and failed surveys are editable", () => {
  for (const s of ["pending", "processing", "ready_to_approve", "failed"]) assert.ok(isSurveyEditable(s), s);
  for (const s of ["under_qa", "approved", "published", "locked", "", undefined]) assert.ok(!isSurveyEditable(s), String(s));
});

test("an untouched form has nothing to save", () => {
  const s = survey();
  assert.equal(surveyDetailsPatch(s, surveyDetailsOf(s)), null);
});

test("the patch carries only what changed, with the updated_at it was read at", () => {
  const s = survey();
  const form = { ...surveyDetailsOf(s), surveyDate: "2026-10-02", datasetName: "  North pit  " };
  assert.deepEqual(surveyDetailsPatch(s, form), {
    survey_date: "2026-10-02",
    dataset_name: "North pit",
    expected_updated_at: 1_759_000_000_000,
  });
});

test("reordering tags is a change; trailing spaces on the stored name are not", () => {
  const s = survey({ metadata: { dataset_name: "Pit ", tags: ["a", "b"] } });
  assert.equal(surveyDetailsPatch(s, { ...surveyDetailsOf(s), datasetName: "Pit" }), null);
  assert.deepEqual(surveyDetailsPatch(s, { ...surveyDetailsOf(s), tags: ["b", "a"] })?.tags, ["b", "a"]);
});

test("the survey's source CRS falls back to its working CRS", () => {
  assert.equal(surveySourceCrs(survey()), "EPSG:7856");
  assert.equal(surveySourceCrs(survey({ metadata: null })), "EPSG:4326");
});

test("an asset without a known role takes one from its kind", () => {
  assert.equal(assetRole(asset("a", "dtm")), "dtm");
  assert.equal(assetRole(asset("a", "", { kind: "ortho" })), "ortho");
  assert.equal(assetRole(asset("a", "toString", { kind: "toString" })), null);
});

test("only assets that need processing are dispatched, each in its own CRS", () => {
  const plan = reprocessPlan(
    [
      asset("dsm.tif", "dsm", { needs_processing: true, crs: "EPSG:28356" }),
      asset("dtm.tif", "dtm"),
      asset("ortho.tif", "ortho", { kind: "ortho", needs_processing: true }),
    ],
    { epsg: "EPSG:7856" }
  );
  assert.deepEqual(
    plan.dispatches.map((d) => [d.request.processor_type, d.request.inputs?.[0]?.crs]),
    [
      ["terrain-quantized-mesh", "EPSG:28356"],
      ["orthophoto-tiles", "EPSG:7856"],
    ]
  );
  assert.deepEqual(
    plan.assets.map((a) => a.id),
    ["dsm.tif", "ortho.tif"]
  );
});

test("a vector file that needs processing brings every vector and contour file into one batch", () => {
  const plan = reprocessPlan(
    [
      asset("haul.geojson", "vector", { kind: "vector", needs_processing: true }),
      asset("contours.dxf", "contours", { kind: "vector" }),
      asset("pads.geojson", "vector", { kind: "vector" }),
      asset("dsm.tif", "dsm"),
    ],
    { epsg: "EPSG:7856" }
  );
  assert.equal(plan.dispatches.length, 1);
  assert.equal(plan.dispatches[0].request.processor_type, "vector-features");
  assert.deepEqual(
    plan.dispatches[0].request.inputs?.map((i) => i.url),
    ["gs://b/original/s1/haul.geojson", "gs://b/original/s1/contours.dxf", "gs://b/original/s1/pads.geojson"]
  );
});

test("pending, removed and superseded assets never dispatch", () => {
  const plan = reprocessPlan(
    [
      asset("pending.tif", "dsm", { status: "pending_upload", needs_processing: true }),
      asset("gone.tif", "dsm", { status: "removed", is_active: false, needs_processing: true }),
      asset("old.tif", "dsm", { status: "superseded", is_active: false, needs_processing: true }),
    ],
    { epsg: "EPSG:7856" }
  );
  assert.deepEqual(plan.dispatches, []);
});

test("assets the caller marks due dispatch without the server flag, and meshes are skipped with a reason", () => {
  const plan = reprocessPlan([asset("cloud.laz", "pointcloud", { kind: "pointcloud" }), asset("site.obj", "site_model", { kind: "site_model" })], {
    epsg: "EPSG:7856",
    alsoDue: new Set(["cloud.laz", "site.obj"]),
  });
  assert.deepEqual(
    plan.dispatches.map((d) => d.request.processor_type),
    ["pointcloud-tiles"]
  );
  assert.equal(plan.skips[0]?.filename, "site.obj");
});

test("a vector file vector-features can't read neither dispatches nor pulls the other vector files in", () => {
  const plan = reprocessPlan(
    [
      asset("Surface.ttm", "vector", { kind: "vector", needs_processing: true }),
      asset("contours.dxf", "contours", { kind: "vector" }),
      asset("dsm.tif", "dsm"),
    ],
    { epsg: "EPSG:7856" }
  );
  assert.deepEqual(plan.dispatches, []);
  assert.deepEqual(
    plan.skips.map((s) => s.filename),
    ["Surface.ttm"]
  );
});
