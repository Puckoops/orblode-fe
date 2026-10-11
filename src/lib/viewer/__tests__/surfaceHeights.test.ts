import { test } from "node:test";
import assert from "node:assert/strict";
import { Cartesian3, Cartographic, type TerrainProvider } from "cesium";

import { SurfaceHeights } from "../surfaceHeights.ts";

const source = {} as TerrainProvider;
const at = (lon: number, lat: number, h = 0) => Cartesian3.fromDegrees(lon, lat, h);
const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A sampler that answers with the longitude in degrees as the height, except where told to fail. */
function fakeSampler(fail = new Set<number>()) {
  const batches: number[] = [];
  const sampler = async (_: TerrainProvider, positions: Cartographic[]) => {
    batches.push(positions.length);
    for (const c of positions) {
      const lon = Math.round((c.longitude * 180) / Math.PI);
      (c as { height: number | undefined }).height = fail.has(lon) ? undefined : lon;
    }
    return positions;
  };
  return { sampler, batches };
}

test("reads fall through to the given positions while sampling is off", () => {
  const heights = new SurfaceHeights(fakeSampler().sampler);
  const p = at(10, 5, 120);
  assert.equal(heights.active, false);
  assert.equal(heights.at(p), undefined);
  assert.deepEqual(heights.lift([p]), [p]);
});

test("requested points land at their sampled heights and subscribers hear it", async () => {
  const heights = new SurfaceHeights(fakeSampler().sampler);
  heights.setSource(source);
  let heard = 0;
  heights.subscribe(() => heard++);
  const p = at(42, 5, 3);
  heights.request([p]);
  await settle();
  assert.equal(heights.at(p), 42);
  near(Cartographic.fromCartesian(heights.lift([p])[0]).height, 42);
  assert.ok(heard > 0);
});

test("points are sampled once, in batches, one batch at a time", async () => {
  const { sampler, batches } = fakeSampler();
  const heights = new SurfaceHeights(sampler);
  heights.setSource(source);
  heights.request([at(1, 0), at(2, 0)]);
  heights.request([at(2, 0), at(3, 0)]);
  await settle();
  heights.request([at(1, 0), at(3, 0)]);
  await settle();
  assert.deepEqual(batches, [2, 1]);
});

test("a spot the source cannot answer reads NaN and keeps its position when lifted", async () => {
  const heights = new SurfaceHeights(fakeSampler(new Set([7])).sampler);
  heights.setSource(source);
  const p = at(7, 0, 15);
  assert.ok(Number.isNaN(await heights.sample(p)));
  assert.deepEqual(heights.lift([p]), [p]);
});

test("a new source drops the old heights and the samples still in flight", async () => {
  const heights = new SurfaceHeights(fakeSampler().sampler);
  heights.setSource(source);
  const pending = heights.sample(at(9, 0));
  heights.setSource({} as TerrainProvider);
  assert.equal(await pending, undefined);
  await settle();
  assert.equal(heights.at(at(9, 0)), undefined);
});
