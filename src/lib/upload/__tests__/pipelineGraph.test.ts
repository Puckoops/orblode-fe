import { test } from "node:test";
import assert from "node:assert/strict";
import { createGraph, flightGraph, NOT_UPLOADED, viewerLayers, type CreateGraphInput, type Graph } from "../pipelineGraph.ts";

const photos = (over: Partial<CreateGraphInput> = {}): CreateGraphInput => ({
  source: "photos",
  photos: NOT_UPLOADED,
  gcpFile: { on: false, upload: NOT_UPLOADED },
  rtk: false,
  preset: "standard",
  layers: { ortho: true, dsm: true, dtm: true, pointcloud: false },
  files: { ortho: NOT_UPLOADED, dsm: NOT_UPLOADED, dtm: NOT_UPLOADED, pointcloud: NOT_UPLOADED },
  vectors: { on: false, siteFiles: 0, upload: null },
  design: { on: false, current: null, upload: null },
  ...over,
});

const node = (g: Graph, id: string) => {
  const n = g.nodes.find((x) => x.id === id);
  assert.ok(n, `no node ${id}`);
  return n;
};
const edge = (g: Graph, id: string) => {
  const e = g.edges.find((x) => x.id === id);
  assert.ok(e, `no edge ${id}`);
  return e;
};

test("photos without ground control warn that the result is metres off, and RTK photos skip it", () => {
  let g = createGraph(photos());
  assert.equal(node(g, "gcp").style, "warn");
  assert.equal(node(g, "gcp").sub, "None · metres off");
  assert.equal(edge(g, "e-gcp").on, false);

  g = createGraph(photos({ rtk: true }));
  assert.equal(node(g, "gcp").style, "skip");
  assert.equal(node(g, "gcp").sub, "RTK photos instead");

  g = createGraph(photos({ gcpFile: { on: true, upload: { state: "done", label: "2 KB" } } }));
  assert.equal(node(g, "gcp").style, "done");
  assert.equal(edge(g, "e-gcp").on, true);
});

test("photogrammetry builds only the ticked layers, and the viewer counts them", () => {
  const g = createGraph(photos({ photos: { state: "uploading", percent: 40.4 }, preset: "high" }));
  assert.equal(node(g, "photos").sub, "Uploading 40%");
  assert.equal(node(g, "odx").sub, "ODX · High");
  assert.equal(node(g, "p-pointcloud").style, "skip");
  assert.equal(node(g, "p-pointcloud").sub, "Not needed");
  assert.equal(edge(g, "e-pointcloud").on, false);
  assert.equal(node(g, "p-dtm").sub, "After photogrammetry");
  assert.equal(node(g, "viewer").sub, "3 layers");
  assert.ok(!g.group, "photos use photogrammetry");
});

test("files go straight to their processors, and photogrammetry is shown left out", () => {
  const g = createGraph(
    photos({
      source: "files",
      layers: { ortho: false, dsm: false, dtm: true, pointcloud: false },
      files: { ortho: NOT_UPLOADED, dsm: NOT_UPLOADED, dtm: { state: "done", label: "70 MB" }, pointcloud: NOT_UPLOADED },
    })
  );
  assert.equal(node(g, "in-dtm").sub, "✓ 70 MB");
  assert.equal(node(g, "in-ortho").sub, "Not provided");
  assert.equal(node(g, "p-dtm").sub, "Runs on upload");
  assert.equal(node(g, "p-ortho").sub, "Skipped");
  assert.equal(g.group?.label, "NOT IN THIS PIPELINE");
  assert.equal(node(g, "x-odx").style, "skip");
  assert.ok(!g.nodes.some((n) => n.id === "odx"));
});

test("the site's design is compared in the viewer only with a terrain layer", () => {
  let g = createGraph(photos({ design: { on: true, current: "rev C", upload: null } }));
  assert.equal(node(g, "in-design").style, "site");
  assert.equal(node(g, "p-design").sub, "In the viewer, after terrain");

  g = createGraph(photos({ layers: { ortho: true, dsm: false, dtm: false, pointcloud: false }, design: { on: true, current: "rev C", upload: null } }));
  assert.equal(node(g, "p-design").sub, "Needs a DSM or DTM");
  assert.ok(!viewerLayers(photos({ layers: { ortho: true, dsm: false, dtm: false, pointcloud: false }, design: { on: true, current: "rev C", upload: null } })).includes("Cut/fill vs design"));

  g = createGraph(photos({ design: { on: false, current: "rev C", upload: null } }));
  assert.equal(node(g, "p-design").sub, "Not used");
  assert.equal(edge(g, "e-design").on, false);
});

test("the site's vectors are already there, and a new file runs", () => {
  let g = createGraph(photos({ vectors: { on: true, siteFiles: 2, upload: null } }));
  assert.equal(node(g, "in-vectors").sub, "2 files");
  assert.equal(node(g, "p-vectors").sub, "Already on the site");

  g = createGraph(photos({ vectors: { on: true, siteFiles: 2, upload: { state: "uploading", percent: 60 } } }));
  assert.equal(node(g, "in-vectors").sub, "Uploading 60%");
  assert.equal(node(g, "p-vectors").sub, "Runs on the new file");

  g = createGraph(photos({ vectors: { on: true, siteFiles: 0, upload: null } }));
  assert.equal(node(g, "in-vectors").sub, "None on the site");
  assert.equal(node(g, "p-vectors").style, "skip");
});

test("nothing to show leaves the viewer empty", () => {
  const g = createGraph(photos({ layers: { ortho: false, dsm: false, dtm: false, pointcloud: false } }));
  assert.equal(node(g, "viewer").sub, "Nothing yet");
  assert.equal(edge(g, "bus").on, false);
});

test("a vendor's processed flight skips photogrammetry and a pre-monsoon one has no study yet", () => {
  const g = flightGraph({
    source: "processed",
    data: { state: "done", label: "1.4 GB" },
    logs: NOT_UPLOADED,
    layers: { dsm: true, orthophoto: false, pointcloud: false },
    season: "pre",
  });
  assert.equal(node(g, "data").title, "Processed files");
  assert.equal(node(g, "odx").title, "Vendor’s processing");
  assert.equal(edge(g, "e-gcp").on, false);
  assert.equal(node(g, "dsm").sub, "Your file");
  assert.equal(node(g, "ortho").style, "skip");
  assert.equal(node(g, "study").style, "skip");
  assert.equal(node(g, "pair").title, "Lease boundary");
  assert.equal(edge(g, "e-study").on, false);
});

test("every node and edge sits inside its canvas", () => {
  const graphs = [
    createGraph(photos()),
    createGraph(photos({ source: "files" })),
    flightGraph({ source: "photos", data: NOT_UPLOADED, logs: NOT_UPLOADED, layers: { dsm: true, orthophoto: true, pointcloud: true }, season: "post" }),
  ];
  for (const g of graphs) {
    for (const n of g.nodes) assert.ok(n.x >= 0 && n.y >= 0 && n.x + n.w <= g.width && n.y + n.h <= g.height, `${n.id} outside ${g.width}×${g.height}`);
    for (const e of g.edges) for (const [x, y] of e.points) assert.ok(x >= 0 && y >= 0 && x <= g.width && y <= g.height, `${e.id} outside`);
  }
});
