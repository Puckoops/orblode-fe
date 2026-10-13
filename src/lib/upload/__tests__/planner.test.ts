import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPT,
  SELECTABLE_ROLES,
  buildProcessorPlan,
  guessRole,
  roleFromRasterBands,
  roleNeedsHeader,
  roleToAssetKind,
  settleRole,
  skipReason,
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

test("a file's own CRS overrides the form CRS in its dispatch", () => {
  const plan = buildProcessorPlan(
    [
      { name: "dsm.tif", role: "dsm", url: url("dsm.tif"), crs: "EPSG:7856" },
      { name: "ortho.tif", role: "ortho", url: url("ortho.tif") },
      { name: "cloud.laz", role: "pointcloud", url: url("cloud.laz"), crs: "EPSG:28356" },
    ],
    { epsg: "EPSG:32756" }
  );
  const crsOf = (i: number) => {
    const { payload, inputs } = plan.dispatches[i].request;
    return [(payload as { source: { crs: string } }).source.crs, inputs?.[0]?.crs];
  };
  assert.deepEqual(crsOf(0), ["EPSG:7856", "EPSG:7856"]);
  assert.deepEqual(crsOf(1), ["EPSG:32756", "EPSG:32756"]);
  assert.deepEqual(crsOf(2), ["EPSG:28356", "EPSG:28356"]);
  assert.equal((plan.dispatches[2].request.payload as { source_crs: string }).source_crs, "EPSG:28356");
});

test("each file in a vector-features batch keeps its own CRS", () => {
  const plan = buildProcessorPlan(
    [
      { name: "contours.dxf", role: "contours", url: url("contours.dxf"), crs: "EPSG:7856" },
      { name: "haul.geojson", role: "vector", url: url("haul.geojson") },
    ],
    { epsg: "EPSG:4326" }
  );
  const { payload, inputs } = plan.dispatches[0].request;
  const files = (payload as { files: { source: { crs: string }; source_crs: string }[] }).files;
  assert.deepEqual(
    files.map((f) => [f.source.crs, f.source_crs]),
    [
      ["EPSG:7856", "EPSG:7856"],
      ["EPSG:4326", "EPSG:4326"],
    ]
  );
  assert.deepEqual(
    inputs?.map((i) => i.crs),
    ["EPSG:7856", "EPSG:4326"]
  );
});

test("a GeoTIFF named for no surface or ortho guesses DSM and waits on its header", () => {
  for (const name of ["Mine_Site_2026-10-11_GeoTIFF_GDA94_MGA_zone_56.tiff", "Mine_Site_2026-10-12_GeoTIFF_WGS_84.tiff"]) {
    assert.equal(guessRole(name, "preprocessed"), "dsm");
    assert.equal(roleNeedsHeader(name, "preprocessed"), true);
  }
  assert.equal(roleNeedsHeader("site_ortho.tif", "preprocessed"), false);
  assert.equal(roleNeedsHeader("site_dsm.tif", "preprocessed"), false);
  assert.equal(roleNeedsHeader("contours.dxf", "preprocessed"), false);
  assert.equal(roleNeedsHeader("survey.tif", "lidar"), false);
  assert.equal(roleNeedsHeader("survey.tif", "design"), false);
});

test("three or more 8-bit bands read as an orthophoto; anything else as a surface", () => {
  assert.equal(roleFromRasterBands(3, 8), "ortho");
  assert.equal(roleFromRasterBands(4, 8), "ortho");
  assert.equal(roleFromRasterBands(1, 32), "dsm");
  assert.equal(roleFromRasterBands(1, 8), "dsm");
  assert.equal(roleFromRasterBands(3, 16), "dsm");
});

test("a header read settles only its own row, and never one the user picked by hand", () => {
  const rows = [
    { file: "a.tiff", role: "dsm" as FileRole, readingRole: true },
    { file: "b.tiff", role: "dsm" as FileRole, readingRole: false },
    { file: "c.tiff", role: "dsm" as FileRole, readingRole: true },
  ];
  assert.deepEqual(
    settleRole(settleRole(settleRole(rows, "a.tiff", "ortho"), "b.tiff", "ortho"), "c.tiff", null).map((r) => [r.role, r.readingRole]),
    [
      ["ortho", false],
      ["dsm", false],
      ["dsm", false],
    ]
  );
});

test("a Trimble TTM surface is stored as a mesh, not sent to vector-features", () => {
  assert.equal(guessRole("Mine Site Surface.ttm", "preprocessed"), "site_model");
  const plan = buildProcessorPlan([{ name: "Mine Site Surface.ttm", role: "site_model", url: url("s.ttm") }], { epsg: "EPSG:7856" });
  assert.deepEqual(plan.dispatches, []);
  assert.equal(plan.skips[0]?.filename, "Mine Site Surface.ttm");
});

test("a vector file ogr2ogr can't read is stored with a reason and left out of the batch", () => {
  const plan = buildProcessorPlan(
    [
      { name: "Surface.ttm", role: "vector", url: url("Surface.ttm") },
      { name: "haul.kml", role: "vector", url: url("haul.kml") },
      { name: "pads.gpkg", role: "vector", url: url("pads.gpkg") },
      { name: "notes", role: "vector", url: url("notes") },
    ],
    { epsg: "EPSG:4326" }
  );
  assert.equal(plan.dispatches.length, 1);
  assert.deepEqual(
    plan.dispatches[0].request.inputs?.map((i) => i.url),
    [url("haul.kml"), url("pads.gpkg")]
  );
  assert.deepEqual(
    plan.skips.map((s) => s.filename),
    ["Surface.ttm", "notes"]
  );
});

const MINE_SITE = {
  ttm: "Mine_Site_07_Dec_2025_TTM_233_198_faces.ttm",
  jpegs: [
    "Mine_Site_07_Dec_2025_JFIF_JPEG_GDA94_MGA_zone_56_16588_17544_.zip",
    "Mine_Site_07_Dec_2025_JFIF_JPEG_GDA94_MGA_zone_56_4727_5000_.zip",
  ],
  faces: [
    "Mine_Site_07_Dec_2025_DXF_1_623_034_faces.zip",
    "Mine_Site_07_Dec_2025_DXF_233_198_faces.zip",
    "Mine_Site_07_Dec_2025_DXF_88_851_faces.zip",
  ],
  czml: "Mine_Site_07_Dec_2025_CZML_Ground_Control_and_Checkpoint_Locations.czml",
  contours: "Mine_Site_07_Dec_2025_DXF_Contours_1_unit.zip",
  vectors: [
    "Mine_Site_07_Dec_2025_GeoJSON_Automatically_Generated_Terrain_Boundary_Mask.json",
    "Mine_Site_07_Dec_2025_Polygons_of_interest (1).json",
    "Mine_Site_07_Dec_2025_Polygons_of_interest.json",
  ],
};

test("a Propeller export's face meshes and JPEG zips guess mesh and orthophoto, not vector", () => {
  for (const name of MINE_SITE.faces) assert.equal(guessRole(name, "preprocessed"), "site_model", name);
  assert.equal(guessRole("pit_faces.dxf", "preprocessed"), "site_model");
  for (const name of MINE_SITE.jpegs) assert.equal(guessRole(name, "preprocessed"), "ortho", name);
  assert.equal(guessRole(MINE_SITE.czml, "preprocessed"), "vector");
  assert.equal(guessRole(MINE_SITE.contours, "preprocessed"), "contours");
  for (const name of MINE_SITE.vectors) assert.equal(guessRole(name, "preprocessed"), "vector", name);
  assert.equal(guessRole("surfaces.dxf", "preprocessed"), "vector");
});

test("only the Mine Site files ogr2ogr reads as 2D vectors reach vector-features", () => {
  const all = [MINE_SITE.ttm, ...MINE_SITE.jpegs, ...MINE_SITE.faces, MINE_SITE.czml, MINE_SITE.contours, ...MINE_SITE.vectors];
  const plan = buildProcessorPlan(
    all.map((name) => ({ name, role: guessRole(name, "preprocessed"), url: url(name) })),
    { epsg: "EPSG:28356" }
  );
  assert.deepEqual(
    plan.dispatches.map((d) => d.request.processor_type),
    ["vector-features"]
  );
  assert.deepEqual(
    plan.dispatches[0].request.inputs?.map((i) => i.url),
    [MINE_SITE.contours, ...MINE_SITE.vectors].map(url)
  );
  assert.deepEqual(
    plan.skips.map((s) => s.filename).sort(),
    [MINE_SITE.ttm, ...MINE_SITE.jpegs, ...MINE_SITE.faces, MINE_SITE.czml].sort()
  );
});

test("a file kept out of vector-features by hand says what it is", () => {
  const plan = buildProcessorPlan(
    [MINE_SITE.faces[0], MINE_SITE.jpegs[0], MINE_SITE.czml, "notes"].map((name) => ({
      name,
      role: "vector" as const,
      url: url(name),
    })),
    { epsg: "EPSG:28356" }
  );
  assert.deepEqual(plan.dispatches, []);
  assert.deepEqual(
    plan.skips.map((s) => s.reason),
    [
      "stored — a DXF face mesh is a 3D surface, not vector linework; pick 3D mesh",
      "stored — a ZIP of JPEG images holds no vector data",
      "stored — GDAL can't read CZML, so no vector layer is built",
      "stored — vector layers are built only from DXF, SHP, GeoJSON, KML or GeoPackage files, or a ZIP of them",
    ]
  );
});

test("an orthophoto that isn't a GeoTIFF is stored, not sent to orthophoto-tiles", () => {
  const plan = buildProcessorPlan(
    [
      { name: MINE_SITE.jpegs[1], role: "ortho", url: url(MINE_SITE.jpegs[1]) },
      { name: "site_ortho.TIF", role: "ortho", url: url("site_ortho.TIF") },
    ],
    { epsg: "EPSG:28356" }
  );
  assert.deepEqual(
    plan.dispatches.map((d) => d.request.inputs?.[0]?.url),
    [url("site_ortho.TIF")]
  );
  assert.deepEqual(plan.skips, [
    { filename: MINE_SITE.jpegs[1], reason: "stored — orthophoto tiles are built only from a GeoTIFF" },
  ]);
});

test("a file to process with no CRS of its own and no fallback is stored with a reason, not dispatched", () => {
  const plan = buildProcessorPlan(
    [
      { name: "dsm.tif", role: "dsm", url: url("dsm.tif") },
      { name: "cloud.laz", role: "pointcloud", url: url("cloud.laz"), crs: "EPSG:28356" },
      { name: "site.ttm", role: "site_model", url: url("site.ttm") },
    ],
    { epsg: "" }
  );
  assert.deepEqual(
    plan.dispatches.map((d) => d.request.processor_type),
    ["pointcloud-tiles"]
  );
  assert.deepEqual(plan.skips, [
    { filename: "dsm.tif", reason: "stored — its CRS isn't known; set one to process it" },
    { filename: "site.ttm", reason: "3D mesh stored — no processor turns meshes into viewer tiles yet" },
  ]);
});

test("skipReason names exactly the files the plan skips", () => {
  const files = [
    { name: "ortho.tif", role: "ortho" as const },
    { name: "ortho.zip", role: "ortho" as const },
    { name: "contours.dxf", role: "contours" as const },
    { name: "Mine_Site_DXF_faces.zip", role: "vector" as const },
    { name: "site.obj", role: "site_model" as const },
    { name: "cloud.laz", role: "pointcloud" as const },
    { name: "plan.ifc", role: "design" as const },
  ];
  const plan = buildProcessorPlan(
    files.map((f) => ({ ...f, url: url(f.name) })),
    { epsg: "EPSG:28356" }
  );
  assert.deepEqual(
    files.filter((f) => skipReason(f.name, f.role)).map((f) => ({ filename: f.name, reason: skipReason(f.name, f.role) })),
    plan.skips
  );
});
