import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CHOICES, parseChoices } from "../siteChoices.ts";

test("a site with nothing remembered starts from the defaults", () => {
  assert.deepEqual(parseChoices(null), DEFAULT_CHOICES);
  assert.deepEqual(parseChoices("not json"), DEFAULT_CHOICES);
});

test("remembered choices come back, and anything unreadable keeps its default", () => {
  const c = parseChoices(
    JSON.stringify({ source: "files", layers: { ortho: false, pointcloud: "yes" }, rtk: true, heights: "geoid", preset: "high", fallbackCrs: "EPSG:28356", siteVectors: false })
  );
  assert.equal(c.source, "files");
  assert.deepEqual(c.layers, { ortho: false, dsm: true, dtm: true, pointcloud: true });
  assert.equal(c.rtk, true);
  assert.equal(c.heights, "ellipsoidal");
  assert.equal(c.preset, "high");
  assert.equal(c.fallbackCrs, "EPSG:28356");
  assert.equal(c.siteVectors, false);
  assert.equal(c.siteDesign, true);
});

test("the DTM is always built, whatever was stored", () => {
  assert.equal(parseChoices(JSON.stringify({ layers: { dtm: false } })).layers.dtm, true);
});
