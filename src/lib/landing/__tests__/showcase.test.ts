import { test } from "node:test";
import assert from "node:assert/strict";

import { displayDate, showcasePath, siteFromShowcase, type ShowcaseEntry } from "../showcaseSite.ts";

const BUCKET = "https://storage.googleapis.com/puckoops-dev";

const entry = (id: string, date: string, project = "site-a", extra: Partial<ShowcaseEntry> = {}): ShowcaseEntry => ({
  survey: { id, project_id: project, status: "processed", survey_date: date, working_crs: "EPSG:28356" },
  label: "Mine site",
  layers: {
    terrain: [
      {
        surface_type: "dsm",
        raw_raster_url: `${BUCKET}/orblode/clients/c1/original/${id}/dsm.tif`,
        compute_raster_url: `${BUCKET}/orblode/processed/terrain-quantized-mesh/wf-${id}/compute.tif`,
        bbox: [151.2, -32.41, 151.21, -32.4],
      },
    ],
    ortho: [{ processor_type: "orthophoto-tiles", asset_kind: "ortho", output_urls: { template: `${BUCKET}/orblode/processed/orthophoto-tiles/wf-o${id}/{z}/{x}/{y}.png` }, min_zoom: 14, max_zoom: 21 }],
  },
  measurements: [],
  ...extra,
});

test("showcasePath maps stored objects onto the public route and leaves other URLs out", () => {
  assert.equal(showcasePath(`${BUCKET}/orblode/a/b.tif`), "/showcase/files/orblode/a/b.tif");
  assert.equal(showcasePath("gs://puckoops-dev/orblode/x/{z}/{x}/{y}.png"), "/showcase/files/orblode/x/{z}/{x}/{y}.png");
  assert.equal(showcasePath("https://example.com/a.tif"), null);
  assert.equal(showcasePath(`${BUCKET}/`), null);
  assert.equal(showcasePath(undefined), null);
});

test("displayDate reads calendar dates and epoch milliseconds", () => {
  assert.equal(displayDate("2025-02-14"), "14 Feb 2025");
  assert.equal(displayDate(Date.UTC(2026, 9, 12)), "12 Oct 2026");
  assert.equal(displayDate("not a date"), null);
});

test("siteFromShowcase shows the newest survey and pairs it with the one before on the same site", async () => {
  const site = await siteFromShowcase([entry("s2", "2025-02-14"), entry("s0", "2024-06-01", "site-b"), entry("s1", "2024-12-10")]);
  assert.ok(site);
  assert.equal(site.mode, "survey");
  assert.equal(site.name, "Mine site");
  assert.equal(site.surveyDate, "14 Feb 2025");
  assert.equal(site.earlierDate, "10 Dec 2024");
  assert.equal(site.surveyCount, 2);
  assert.equal(site.source?.dsm, "/showcase/files/orblode/processed/terrain-quantized-mesh/wf-s2/compute.tif");
  assert.equal(site.source?.earlierDsm, "/showcase/files/orblode/processed/terrain-quantized-mesh/wf-s1/compute.tif");
  assert.equal(site.source?.ortho?.template, "/showcase/files/orblode/processed/orthophoto-tiles/wf-os2/{z}/{x}/{y}.png");
  assert.ok(site.origin.east > 300_000 && site.origin.north > 6_000_000, "origin is in MGA zone 56");
  assert.ok(site.source?.projDef.includes("+proj=utm"));
});

test("siteFromShowcase features the biggest completed volume, projected around the origin", async () => {
  const square = (d: number) => [[[151.205 - d, -32.405 - d], [151.205 + d, -32.405 - d], [151.205 + d, -32.405 + d], [151.205 - d, -32.405 + d], [151.205 - d, -32.405 - d]]];
  const site = await siteFromShowcase([
    entry("s1", "2025-02-14", "site-a", {
      measurements: [
        { id: "m1", kind: "stockpile", name: "Small pile", status: "completed", geometry: { type: "Polygon", coordinates: square(0.0001) }, result: { metrics: { volume_m3: 120 } } },
        { id: "m2", kind: "stockpile", name: "ROM pad", status: "completed", geometry: { type: "Polygon", coordinates: square(0.0003) }, params: { from: { type: "smart_base" } }, result: { metrics: { volume_m3: 8400, area_m2: 3500 } }, computed_at: Date.UTC(2026, 9, 1) },
        { id: "m3", kind: "stockpile", name: "Draft", status: "computing", geometry: { type: "Polygon", coordinates: square(0.001) }, result: { metrics: { volume_m3: 99_999 } } },
        { id: "m4", kind: "cut_fill", name: "Bench 3", status: "completed", result: { metrics: { cut_volume_m3: 900, fill_volume_m3: 400 } } },
      ],
    }),
  ]);
  assert.equal(site?.featured?.name, "ROM pad");
  assert.equal(site?.featured?.volume, 8400);
  assert.equal(site?.featured?.base, "Smart base");
  assert.equal(site?.featured?.computedAt, "1 Oct 2026");
  assert.ok(Math.hypot(...site!.featured!.centre) < 5, "a pile at the bbox centre sits near the origin");
  assert.ok(site!.featured!.reach > 30 && site!.featured!.reach < 60, `reach ${site!.featured!.reach}`);
  assert.deepEqual(site?.cutFill, { cut: 900, fill: 400, label: "Bench 3" });
});

test("siteFromShowcase passes over a survey whose DSM can't be previewed", async () => {
  const site = await siteFromShowcase([entry("s1", "2024-12-10"), entry("s2", "2025-02-14")], async (path) => !path.includes("wf-s2"));
  assert.equal(site?.surveyDate, "10 Dec 2024");
  assert.equal(site?.earlierDate, null);
  assert.equal(await siteFromShowcase([entry("s1", "2024-12-10")], async () => false), null);
});

test("siteFromShowcase gives the viewer's untitled measurements plain names", async () => {
  const square = [[[151.2049, -32.4051], [151.2051, -32.4051], [151.2051, -32.4049], [151.2049, -32.4049]]];
  const site = await siteFromShowcase([
    entry("s1", "2025-02-14", "site-a", {
      measurements: [
        { id: "m1", kind: "stockpile", name: "Untitled stockpile", status: "completed", geometry: { type: "Polygon", coordinates: square }, result: { metrics: { volume_m3: 50 } } },
        { id: "m2", kind: "cut_fill", name: "Untitled cut fill", status: "completed", result: { metrics: { cut_volume_m3: 309, fill_volume_m3: 124 } } },
      ],
    }),
  ]);
  assert.equal(site?.featured?.name, "Stockpile");
  assert.equal(site?.cutFill?.label, "Cut and fill");
});

test("siteFromShowcase gives up without a DSM", async () => {
  assert.equal(await siteFromShowcase([entry("s1", "2025-02-14", "site-a", { layers: { terrain: [], ortho: null } })]), null);
  assert.equal(await siteFromShowcase([]), null);
});
