import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPT,
  SELECTABLE_ROLES,
  buildProcessorPlan,
  guessRole,
  roleToAssetKind,
  type DataType,
  type FileRole,
} from "../planner.ts";

const LEGACY_TYPES = new Set([
  "orthophoto-tiles",
  "vector-features",
  "terrain-quantized-mesh",
  "pointcloud-tiles",
  "terrain-lens-bake",
]);

const url = (name: string) => `https://storage.googleapis.com/bucket/orblode/clients/c/original/s/${name}`;

test("a DSM or DTM dispatches terrain-quantized-mesh alone, with no co-register step", () => {
  for (const role of ["dsm", "dtm"] as const) {
    const plan = buildProcessorPlan([{ name: `${role}.tif`, role, url: url(`${role}.tif`) }], { epsg: "EPSG:32756" });
    assert.equal(plan.dispatches.length, 1);
    assert.deepEqual(plan.dispatches[0].request, {
      processor_type: "terrain-quantized-mesh",
      payload: {
        source: { url: url(`${role}.tif`), kind: "terrain", crs: "EPSG:32756" },
        surface_type: role,
      },
      inputs: [{ url: url(`${role}.tif`), kind: "terrain", crs: "EPSG:32756" }],
    });
  }
});

test("every planned dispatch is a type a legacy worker runs", () => {
  const roles: FileRole[] = ["dsm", "dtm", "ortho", "pointcloud", "contours", "vector", "site_model", "design"];
  const plan = buildProcessorPlan(
    roles.map((role, i) => ({ name: `f${i}`, role, url: url(`f${i}`) })),
    { epsg: "EPSG:4326" }
  );
  assert.ok(plan.dispatches.length > 0);
  for (const d of plan.dispatches) assert.ok(LEGACY_TYPES.has(d.request.processor_type), d.request.processor_type);
});

test("vector and contour files batch into one vector-features call", () => {
  const plan = buildProcessorPlan(
    [
      { name: "contours.dxf", role: "contours", url: url("contours.dxf") },
      { name: "haul.geojson", role: "vector", url: url("haul.geojson") },
    ],
    { epsg: "EPSG:4326" }
  );
  assert.equal(plan.dispatches.length, 1);
  const files = (plan.dispatches[0].request.payload as { files: { role: string; format: string }[] }).files;
  assert.deepEqual(
    files.map((f) => [f.role, f.format]),
    [
      ["contours", "contour"],
      ["overlay", ""],
    ]
  );
});

test("a 3D mesh is stored but skipped with a reason", () => {
  const plan = buildProcessorPlan([{ name: "site.obj", role: "site_model", url: url("site.obj") }], { epsg: "EPSG:4326" });
  assert.equal(plan.dispatches.length, 0);
  assert.equal(plan.skips[0]?.filename, "site.obj");
});

test("no data type offers drone photos or GCP files any more", () => {
  for (const type of Object.keys(SELECTABLE_ROLES) as DataType[]) {
    for (const role of SELECTABLE_ROLES[type]) assert.ok(!["images", "gcp"].includes(roleToAssetKind(role)));
    assert.ok(!ACCEPT[type].split(",").includes(".csv"));
  }
  assert.deepEqual(Object.keys(SELECTABLE_ROLES).sort(), ["design", "lidar", "preprocessed"]);
});

test("guessRole sniffs surfaces and ortho from the name", () => {
  assert.equal(guessRole("site_dtm.tif", "preprocessed"), "dtm");
  assert.equal(guessRole("site_ortho.tiff", "preprocessed"), "ortho");
  assert.equal(guessRole("surface.tif", "preprocessed"), "dsm");
  assert.equal(guessRole("cloud.laz", "preprocessed"), "pointcloud");
  assert.equal(guessRole("contour_1m.dxf", "preprocessed"), "contours");
  assert.equal(guessRole("anything.las", "lidar"), "pointcloud");
  assert.equal(guessRole("pad.xml", "design"), "design");
});
