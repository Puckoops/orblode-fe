import { test } from "node:test";
import assert from "node:assert/strict";

import {
  axisTicks,
  buildAreaPath,
  buildProfileRequest,
  buildScales,
  buildTracePath,
  clampSpacing,
  elevationDomain,
  nearestSample,
  nearestSampleToPoint,
  needsProjection,
  overallGradePercent,
  parseProfileSeries,
  projectPolyline,
  type ChartBox,
  type ProfileSeries,
} from "../profile.ts";

const BOX: ChartBox = {
  width: 400,
  height: 200,
  padLeft: 40,
  padRight: 10,
  padTop: 10,
  padBottom: 30,
};

/** A 5-station, 40 m ramp from 10 m to 14 m. */
function rampDoc() {
  return {
    length_m: 40,
    samples: [
      { distance_m: 0, x: 0, y: 0, z: 10 },
      { distance_m: 10, x: 10, y: 0, z: 11 },
      { distance_m: 20, x: 20, y: 0, z: 12 },
      { distance_m: 30, x: 30, y: 0, z: 13 },
      { distance_m: 40, x: 40, y: 0, z: 14 },
    ],
  };
}

test("needsProjection: geographic CRSs sample in degrees, projected ones don't", () => {
  assert.equal(needsProjection("EPSG:4326"), false);
  assert.equal(needsProjection("epsg:4979"), false);
  assert.equal(needsProjection("+proj=longlat +datum=WGS84 +no_defs"), false);
  assert.equal(needsProjection("EPSG:32756"), true);
  assert.equal(needsProjection("EPSG:7856"), true);
});

test("needsProjection: an absent or blank CRS is treated as geographic", () => {
  // Manifests for geographic DSMs routinely omit crs; profile.py samples those
  // rasters in degrees, which is what the stored GeoJSON already is.
  assert.equal(needsProjection(undefined), false);
  assert.equal(needsProjection(null), false);
  assert.equal(needsProjection("   "), false);
});

test("projectPolyline forwards every vertex and rejects a non-finite result", () => {
  const forward = ([lon, lat]: [number, number]): [number, number] => [lon * 2, lat * 3];
  assert.deepEqual(
    projectPolyline(
      [
        [1, 2],
        [3, 4],
      ],
      forward
    ),
    [
      [2, 6],
      [6, 12],
    ]
  );

  // A polyline that partially projects must NOT be dispatched — half the
  // vertices in metres and half in degrees would sample the wrong raster cells.
  const broken = ([lon]: [number, number]): [number, number] =>
    lon === 3 ? [NaN, 0] : [lon, 0];
  assert.equal(
    projectPolyline(
      [
        [1, 2],
        [3, 4],
      ],
      broken
    ),
    null
  );
});

test("buildProfileRequest matches the deployed profile-extract v1 schema", () => {
  const req = buildProfileRequest({
    sourceUrl: "gs://bucket/dsm.tif",
    crs: "EPSG:32756",
    polyline: [
      [334000, 6250000],
      [334100, 6250000],
    ],
    spacingM: 1,
  });
  assert.deepEqual(req.payload, {
    source: { url: "gs://bucket/dsm.tif", kind: "terrain", crs: "EPSG:32756" },
    polyline: [
      [334000, 6250000],
      [334100, 6250000],
    ],
    spacing_m: 1,
  });
  assert.deepEqual(req.inputs, [
    { url: "gs://bucket/dsm.tif", kind: "terrain", crs: "EPSG:32756" },
  ]);
});

test("buildProfileRequest omits crs when the manifest has none", () => {
  const req = buildProfileRequest({
    sourceUrl: "gs://bucket/dsm.tif",
    polyline: [
      [0, 0],
      [1, 1],
    ],
  });
  assert.deepEqual(req.inputs, [{ url: "gs://bucket/dsm.tif", kind: "terrain" }]);
  assert.equal("crs" in (req.payload.source as object), false);
});

test("clampSpacing keeps the chainage interval in a usable band", () => {
  assert.equal(clampSpacing(1), 1);
  assert.equal(clampSpacing(0.001), 0.1); // below any DSM's ground resolution
  assert.equal(clampSpacing(9999), 50);
  assert.equal(clampSpacing(0), 1); // degenerate → the 1 m default
  assert.equal(clampSpacing(NaN), 1);
});

test("parseProfileSeries reads the wire shape and derives the z extent", () => {
  const s = parseProfileSeries(rampDoc());
  assert.ok(s);
  assert.equal(s.samples.length, 5);
  assert.equal(s.lengthM, 40);
  assert.equal(s.minZ, 10);
  assert.equal(s.maxZ, 14);
});

test("parseProfileSeries preserves nodata as null rather than interpolating", () => {
  const s = parseProfileSeries({
    length_m: 20,
    samples: [
      { distance_m: 0, x: 0, y: 0, z: 10 },
      { distance_m: 10, x: 10, y: 0, z: null },
      { distance_m: 20, x: 20, y: 0, z: 12 },
    ],
  });
  assert.ok(s);
  assert.equal(s.samples[1].z, null);
  // The extent ignores the hole.
  assert.equal(s.minZ, 10);
  assert.equal(s.maxZ, 12);
});

test("parseProfileSeries rejects malformed documents", () => {
  assert.equal(parseProfileSeries(null), null);
  assert.equal(parseProfileSeries({}), null);
  assert.equal(parseProfileSeries({ samples: "nope" }), null);
  // A single station is a point, not a profile.
  assert.equal(parseProfileSeries({ samples: [{ distance_m: 0, z: 1 }] }), null);
});

test("parseProfileSeries sorts by chainage and drops station-less entries", () => {
  const s = parseProfileSeries({
    samples: [
      { distance_m: 20, x: 20, y: 0, z: 12 },
      { x: 5, y: 0, z: 99 }, // no chainage → no x-position → dropped
      { distance_m: 0, x: 0, y: 0, z: 10 },
      { distance_m: 10, x: 10, y: 0, z: 11 },
    ],
  });
  assert.ok(s);
  assert.deepEqual(
    s.samples.map((x) => x.distanceM),
    [0, 10, 20]
  );
  // length_m absent → falls back to the last station's chainage.
  assert.equal(s.lengthM, 20);
});

test("parseProfileSeries returns a null extent when every station is nodata", () => {
  const s = parseProfileSeries({
    length_m: 10,
    samples: [
      { distance_m: 0, x: 0, y: 0, z: null },
      { distance_m: 10, x: 10, y: 0, z: null },
    ],
  });
  assert.ok(s);
  assert.equal(s.minZ, null);
  assert.equal(s.maxZ, null);
});

test("buildScales maps the series across the plot rect and inverts elevation", () => {
  const series = parseProfileSeries(rampDoc()) as ProfileSeries;
  const sc = buildScales(series, BOX);

  assert.equal(sc.xOf(0), 40); // chainage 0 → plot left
  assert.equal(sc.xOf(40), 390); // full length → plot right

  // Higher elevation must map to a SMALLER y (SVG y grows downward).
  assert.ok(sc.yOf(14) < sc.yOf(10));
  assert.ok(sc.yOf(10) <= sc.plotBottom);
  assert.ok(sc.yOf(14) >= sc.plotTop);
});

test("distanceAt inverts xOf so hover hit-testing round-trips", () => {
  const series = parseProfileSeries(rampDoc()) as ProfileSeries;
  const sc = buildScales(series, BOX);
  for (const d of [0, 7.5, 20, 40]) {
    assert.ok(Math.abs(sc.distanceAt(sc.xOf(d)) - d) < 1e-9, `round-trip at ${d}`);
  }
});

test("elevationDomain opens a flat profile instead of collapsing to zero height", () => {
  const flat = elevationDomain(50, 50);
  assert.equal(flat.hi - flat.lo, 1);
  const sloped = elevationDomain(10, 20);
  assert.ok(sloped.lo < 10 && sloped.hi > 20);
});

test("a perfectly flat profile still produces finite chart geometry", () => {
  const series = parseProfileSeries({
    length_m: 10,
    samples: [
      { distance_m: 0, x: 0, y: 0, z: 7 },
      { distance_m: 10, x: 10, y: 0, z: 7 },
    ],
  }) as ProfileSeries;
  const sc = buildScales(series, BOX);
  assert.ok(Number.isFinite(sc.yOf(7)));
  assert.ok(!buildTracePath(series, sc).includes("NaN"));
});

test("buildTracePath breaks the line at nodata gaps", () => {
  const series = parseProfileSeries({
    length_m: 30,
    samples: [
      { distance_m: 0, x: 0, y: 0, z: 10 },
      { distance_m: 10, x: 10, y: 0, z: 11 },
      { distance_m: 20, x: 20, y: 0, z: null },
      { distance_m: 30, x: 30, y: 0, z: 13 },
    ],
  }) as ProfileSeries;
  const d = buildTracePath(series, buildScales(series, BOX));
  // Two moves = two runs: the gap must not be bridged by a straight segment.
  assert.equal((d.match(/M/g) || []).length, 2);
});

test("buildAreaPath emits one closed subpath per contiguous run", () => {
  const series = parseProfileSeries({
    length_m: 30,
    samples: [
      { distance_m: 0, x: 0, y: 0, z: 10 },
      { distance_m: 10, x: 10, y: 0, z: 11 },
      { distance_m: 20, x: 20, y: 0, z: null },
      { distance_m: 30, x: 30, y: 0, z: 13 },
    ],
  }) as ProfileSeries;
  const d = buildAreaPath(series, buildScales(series, BOX));
  // The lone post-gap station cannot close a region, so exactly one subpath.
  assert.equal((d.match(/Z/g) || []).length, 1);
});

test("nearestSample binary-searches to the closest station", () => {
  const series = parseProfileSeries(rampDoc()) as ProfileSeries;
  assert.equal(nearestSample(series, 0)?.index, 0);
  assert.equal(nearestSample(series, 14)?.index, 1); // 14 is nearer 10 than 20
  assert.equal(nearestSample(series, 16)?.index, 2);
  assert.equal(nearestSample(series, 40)?.index, 4);
  // Off the ends clamps rather than returning null.
  assert.equal(nearestSample(series, -100)?.index, 0);
  assert.equal(nearestSample(series, 9999)?.index, 4);
});

test("nearestSampleToPoint bridges a 3D cursor back to a station", () => {
  const series = parseProfileSeries(rampDoc()) as ProfileSeries;
  const hit = nearestSampleToPoint(series, 21, 1, 5);
  assert.equal(hit?.index, 2);
  assert.equal(hit?.sample.distanceM, 20);
});

test("nearestSampleToPoint rejects a cursor that isn't near the line", () => {
  const series = parseProfileSeries(rampDoc()) as ProfileSeries;
  // Without the radius gate, hovering anywhere on the map would light up a station.
  assert.equal(nearestSampleToPoint(series, 5000, 5000, 5), null);
});

test("nearestSampleToPoint skips nodata stations", () => {
  const series = parseProfileSeries({
    length_m: 20,
    samples: [
      { distance_m: 0, x: 0, y: 0, z: 10 },
      { distance_m: 10, x: 10, y: 0, z: null },
      { distance_m: 20, x: 20, y: 0, z: 12 },
    ],
  }) as ProfileSeries;
  // Sitting exactly on the nodata station snaps to a station that has elevation.
  const hit = nearestSampleToPoint(series, 10, 0, 100);
  assert.notEqual(hit?.sample.z, null);
});

test("axisTicks lands on nice 1/2/5 steps inside the range", () => {
  const t = axisTicks(0, 100, 5);
  assert.deepEqual(t, [0, 20, 40, 60, 80, 100]);
  for (const v of t) assert.ok(v >= 0 && v <= 100);
});

test("axisTicks does not accumulate float drift in its labels", () => {
  // Repeated += of a fractional step would give 0.30000000000000004.
  const t = axisTicks(0, 1, 10);
  assert.ok(t.includes(0.3), `expected a clean 0.3 in ${JSON.stringify(t)}`);
});

test("axisTicks returns nothing for a degenerate range", () => {
  assert.deepEqual(axisTicks(5, 5), []);
  assert.deepEqual(axisTicks(10, 0), []);
  assert.deepEqual(axisTicks(0, NaN), []);
});

test("overallGradePercent measures rise over run between valid ends", () => {
  const series = parseProfileSeries(rampDoc()) as ProfileSeries;
  // 4 m over 40 m = 10 %.
  assert.equal(overallGradePercent(series), 10);
});

test("overallGradePercent is null when the profile has no usable ends", () => {
  const series = parseProfileSeries({
    length_m: 10,
    samples: [
      { distance_m: 0, x: 0, y: 0, z: null },
      { distance_m: 10, x: 10, y: 0, z: null },
    ],
  }) as ProfileSeries;
  assert.equal(overallGradePercent(series), null);
});
