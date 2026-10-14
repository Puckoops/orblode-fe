import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_COMPARE,
  buildSeries,
  chartDomain,
  crossSectionOf,
  dxfLayer,
  gradeOf,
  nearestIndex,
  nextSeriesColor,
  niceTicks,
  profileCsv,
  profileDxf,
  profileSurfaces,
  tangentGrade,
  tracePath,
  widthAtLevel,
  zExtent,
  type CompareRef,
} from "../profile.ts";
import { PROFILE_SERIES } from "../sceneStyle.ts";

const SURVEY = "6ac76c76e4b0a1b2c3d4e5f6";
const DESIGN = "6ac8e697e4b0a1b2c3d4e5f6";

test("every line shows its chart until it is turned off", () => {
  assert.equal(crossSectionOf(undefined).show, true);
  assert.equal(crossSectionOf({}).show, true);
  assert.equal(crossSectionOf({ cross_section: { compare: [] } }).show, true);
  assert.equal(crossSectionOf({ cross_section: { show: false } }).show, false);
});

test("stored comparisons are parsed, deduplicated and capped", () => {
  const compare = [
    { type: "survey_terrain", survey_id: SURVEY, surface: "dtm", color: "#123456" },
    { type: "survey_terrain", survey_id: SURVEY, surface: "dtm", color: "#654321" },
    { type: "survey_terrain", survey_id: "nope" },
    { type: "design", design_id: DESIGN, color: "red" },
    { type: "reference_level", elevation_m: 100 },
    { type: "reference_level", elevation_m: "100" },
    { type: "contour" },
    null,
  ];
  const s = crossSectionOf({ cross_section: { compare } });
  assert.deepEqual(s.compare, [
    { type: "survey_terrain", survey_id: SURVEY, surface: "dtm", color: "#123456" },
    { type: "design", design_id: DESIGN, color: PROFILE_SERIES[0] },
    { type: "reference_level", elevation_m: 100, color: PROFILE_SERIES[0] },
  ]);

  const many = Array.from({ length: 12 }, (_, k) => ({ type: "reference_level", elevation_m: k }));
  assert.equal(crossSectionOf({ cross_section: { compare: many } }).compare.length, MAX_COMPARE);
});

test("each comparison takes the next unused colour", () => {
  const used: CompareRef[] = [{ type: "reference_level", elevation_m: 1, color: PROFILE_SERIES[0] }];
  assert.equal(nextSeriesColor([]), PROFILE_SERIES[0]);
  assert.equal(nextSeriesColor(used), PROFILE_SERIES[1]);
});

test("the survey's DSM is asked for first and reference levels are drawn locally", () => {
  const compare: CompareRef[] = [
    { type: "reference_level", elevation_m: 100, color: "#111111" },
    { type: "design", design_id: DESIGN, color: "#222222" },
    { type: "survey_terrain", survey_id: SURVEY, surface: "dsm", color: "#333333" },
  ];
  assert.deepEqual(profileSurfaces(compare), [
    { type: "survey_terrain", surface: "dsm" },
    { type: "design", design_id: DESIGN },
    { type: "survey_terrain", survey_id: SURVEY, surface: "dsm" },
  ]);

  const series = buildSeries(
    {
      length_m: 2,
      spacing_m: 1,
      vertices_m: [0, 2],
      distance_m: [0, 1, 2],
      lon: [0, 0, 0],
      lat: [0, 0, 0],
      surfaces: [
        { type: "survey_terrain", z: [1, 2, 3] },
        { type: "design", design_id: DESIGN, error: { class: "surface_not_registered", message: "not built" } },
        { type: "survey_terrain", survey_id: SURVEY, z: [0, null, 1] },
      ],
    },
    compare,
    "#C97A4E"
  );
  assert.deepEqual(
    series.map((s) => [s.key, s.color, s.z, s.error ?? null, s.primary]),
    [
      ["survey", "#C97A4E", [1, 2, 3], null, true],
      ["rl:100", "#111111", [100, 100, 100], null, false],
      [`design:${DESIGN}`, "#222222", null, "not built", false],
      [`survey:${SURVEY}:dsm`, "#333333", [0, null, 1], null, false],
    ]
  );
});

test("zExtent reads only the stations in the window", () => {
  const series = [{ key: "a", color: "", primary: true, z: [5, null, 1, 9] }];
  assert.deepEqual(zExtent([0, 1, 2, 3], series, 0, 2), { lo: 1, hi: 5 });
  assert.equal(zExtent([0, 1, 2, 3], [{ ...series[0], z: null }], 0, 3), null);
});

test("fit stretches the heights over the plot", () => {
  const d = chartDomain({ d0: 0, d1: 100 }, { lo: 10, hi: 20 }, { width: 500, height: 200 }, "fit");
  assert.equal(d.x0, 0);
  assert.equal(d.x1, 100);
  assert.ok(d.y0 < 10 && d.y1 > 20);
});

test("a ratio keeps a metre of height n metres of chainage tall", () => {
  const plot = { width: 500, height: 200 };
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  for (const ratio of [1, 2, 4, 8] as const) {
    for (const extent of [{ lo: 10, hi: 11 }, { lo: 0, hi: 400 }]) {
      const d = chartDomain({ d0: 0, d1: 100 }, extent, plot, ratio);
      const mx = (d.x1 - d.x0) / plot.width;
      const my = (d.y1 - d.y0) / plot.height;
      assert.ok(near(mx / my, ratio), `1:${ratio} ${JSON.stringify(extent)}: ${mx / my}`);
      assert.ok(d.x0 <= 0 && d.x1 >= 100 && d.y0 <= extent.lo && d.y1 >= extent.hi);
      assert.ok(near((d.x0 + d.x1) / 2, 50));
    }
  }
});

test("niceTicks steps by 1, 2 or 5", () => {
  assert.deepEqual(niceTicks(0, 10, 5), { step: 2, values: [0, 2, 4, 6, 8, 10] });
  assert.deepEqual(niceTicks(101.3, 101.9, 3).values, [101.4, 101.6, 101.8]);
  assert.deepEqual(niceTicks(5, 5, 4), { step: 0, values: [] });
});

test("a hole in the surface lifts the pen", () => {
  const path = tracePath([0, 1, 2, 3], [1, null, 2, 3], (d) => d * 10, (z) => -z);
  assert.equal(path, "M0.0 -1.0M20.0 -2.0L30.0 -3.0");
});

test("nearestIndex snaps to the closest station", () => {
  const d = [0, 1, 2.5, 4];
  assert.equal(nearestIndex(d, -3), 0);
  assert.equal(nearestIndex(d, 1.7), 1);
  assert.equal(nearestIndex(d, 1.8), 2);
  assert.equal(nearestIndex(d, 99), 3);
  assert.equal(nearestIndex([], 1), -1);
});

test("grades read as percent, degrees and 1:n", () => {
  const g = gradeOf(1, 10)!;
  assert.ok(Math.abs(g.percent - 10) < 1e-12);
  assert.ok(Math.abs(g.degrees - 5.710593137499643) < 1e-12);
  assert.equal(g.run, 10);
  assert.equal(gradeOf(0, 10)!.run, null);
  assert.equal(gradeOf(1, 0), null);

  const d = [0, 1, 2, 3, 4, 5];
  const z = [0, 0.5, 1, 1.5, null, 3];
  assert.ok(Math.abs(tangentGrade(d, z, 2, 1)!.percent - 50) < 1e-12);
  assert.ok(Math.abs(tangentGrade(d, z, 3, 2)!.percent - 50) < 1e-12, "a hole ends the window");
  assert.equal(tangentGrade(d, z, 4, 1), null);
});

test("widthAtLevel spans the crossings either side of the cursor", () => {
  const d = [0, 1, 2, 3, 4, 5, 6];
  const trench = [10, 10, 6, 6, 6, 10, 10];
  const w = widthAtLevel(d, trench, 3, 8)!;
  assert.ok(Math.abs(w.from - 1.5) < 1e-12 && Math.abs(w.to - 4.5) < 1e-12);
  assert.equal(widthAtLevel(d, trench, 3, 12), null);
  assert.equal(widthAtLevel(d, [10, 10, 6, null, 6, 10, 10], 3, 8), null);
});

test("the CSV has a row per station and leaves holes empty", () => {
  const csv = profileCsv({ distance_m: [0, 1.5], lon: [151.2, 151.20001], lat: [-33.8, -33.8] }, [
    { label: "Survey, DSM", z: [10, null] },
    { label: "RL 100", z: [100, 100] },
  ]);
  assert.equal(
    csv,
    'chainage_m,longitude,latitude,"Survey, DSM (m)",RL 100 (m)\n0.000,151.20000000,-33.80000000,10.000,100.000\n1.500,151.20001000,-33.80000000,,100.000\n'
  );
});

test("the DXF draws each unbroken run as a polyline on its surface's layer", () => {
  const dxf = profileDxf([0, 1, 2, 3], [{ label: "14 Oct 2026 · DSM", z: [1, 2, null, 4] }, { label: "x", z: [1, 1, 1, 1] }]);
  const lines = dxf.trim().split("\n");
  assert.equal(lines.filter((l) => l === "POLYLINE").length, 2, "a lone station is no polyline");
  assert.equal(lines.filter((l) => l === "VERTEX").length, 6);
  assert.ok(lines.includes("14_Oct_2026_DSM"));
  assert.deepEqual(lines.slice(-4), ["0", "ENDSEC", "0", "EOF"]);

  const plan = profileDxf([0, 1], [{ label: "s", z: [5, 6] }], { east: [300000, 300001], north: [6200000, 6200000] });
  assert.ok(plan.includes("10\n300001.0000\n20\n6200000.0000\n30\n6.0000\n70\n32"));
  assert.equal(dxfLayer("···"), "SURFACE");
});
