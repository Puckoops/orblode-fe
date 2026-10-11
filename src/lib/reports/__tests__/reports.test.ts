import { test } from "node:test";
import assert from "node:assert/strict";

import type { InventoryReport, Material, MaterialTrend } from "../../api/orblodeSvc.ts";
import {
  defaultReconciliationPair,
  formatCubic,
  formatDelta,
  formatTonnes,
  formatValue,
  inventoryCsv,
  parseCsv,
  parseProductionCsv,
  productionPeriods,
  trendSeries,
} from "../index.ts";

const material = (id: string, name: string): Material =>
  ({ id, name, project_id: "p1", density_t_m3: 1.6, default_cut_factor: 1, default_fill_factor: 1, value_per_t: 0 });

test("parseCsv keeps quoted commas, doubled quotes and CRLF rows", () => {
  assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\r\n\r\n1,2,3'), [
    ["a", "b, c", 'say "hi"'],
    ["1", "2", "3"],
  ]);
});

test("parseProductionCsv matches materials by name or id and adds up repeated rows", () => {
  const out = parseProductionCsv(
    "Material,mined_tonnage_t,dispatched_tonnage_t\nROM coal,1200,950\nm2,\"1,500\",0\nrom COAL,100,50\n",
    [material("m1", "ROM coal"), material("m2", "Overburden")]
  );
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.lines, [
    { material_id: "m1", mined_t: 1300, dispatched_t: 1000 },
    { material_id: "m2", mined_t: 1500, dispatched_t: 0 },
  ]);
});

test("parseProductionCsv names the rows it cannot read", () => {
  const out = parseProductionCsv("material,mined_t\nGold,5\nROM coal,-2\n", [material("m1", "ROM coal")]);
  assert.equal(out.lines.length, 0);
  assert.equal(out.errors.length, 2);
  assert.match(out.errors[0], /Row 2: "Gold"/);
  assert.match(out.errors[1], /Row 3: mined "-2"/);
  assert.match(parseProductionCsv("name,qty\nx,1", []).errors[0], /header needs/);
});

test("inventoryCsv lists current piles then removed ones", () => {
  const report = {
    piles: [{ name: 'Pile "A", north', pile_id: "p", material_name: "Coal", state: "computed", volume_m3: 10, tonnage_t: 16 }],
    removed_piles: [{ name: "Old", pile_id: "q", state: "computed", volume_m3: 5, tonnage_t: 8, delta_volume_m3: -5, delta_tonnage_t: -8 }],
  } as unknown as InventoryReport;
  const lines = inventoryCsv(report).trimEnd().split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '"Pile ""A"", north",p,Coal,computed,10,,16,,,,,');
  assert.equal(lines[2], "Old,q,,removed,0,0,0,0,5,8,-5,-8");
});

test("productionPeriods groups by period, newest first", () => {
  const rec = (id: string, start: string, end: string) =>
    ({ id, material_id: "m", period_start: start, period_end: end, mined_t: 1, dispatched_t: 0 });
  const periods = productionPeriods([rec("a", "2026-08-01", "2026-08-31"), rec("b", "2026-09-01", "2026-09-30"), rec("c", "2026-08-01", "2026-08-31")]);
  assert.deepEqual(
    periods.map((p) => [p.start, p.records.length]),
    [
      ["2026-09-01", 1],
      ["2026-08-01", 2],
    ]
  );
});

test("defaultReconciliationPair takes the latest two surveys in date order", () => {
  assert.equal(defaultReconciliationPair([{ id: "a", date: "2026-01-01" }]), null);
  assert.deepEqual(
    defaultReconciliationPair([
      { id: "c", date: "2026-03-01" },
      { id: "a", date: "2026-01-01" },
      { id: "b", date: "2026-02-01" },
    ]),
    ["b", "c"]
  );
});

test("trendSeries draws the fitted line the report sends", () => {
  const trend = {
    material_id: "m1",
    name: "Coal",
    points: [
      { survey_id: "a", date: "2026-01-01", tonnage_t: 100, volume_m3: 60, fitted_t: 98 },
      { survey_id: "b", date: "2026-01-11", tonnage_t: 80, volume_m3: 50, fitted_t: 82 },
    ],
    slope_t_per_day: -1.6,
    forecast: [{ date: "2026-02-10", tonnage_t: 0 }],
    anomalies: [],
  } satisfies MaterialTrend;
  assert.deepEqual(trendSeries(trend), {
    unit: "t",
    data: [
      { label: "2026-01-01", value: 100, comparison: 98 },
      { label: "2026-01-11", value: 80, comparison: 82 },
    ],
  });
  const noDensity = { ...trend, points: trend.points.map((p) => ({ ...p, tonnage_t: 0 })) };
  assert.deepEqual(trendSeries(noDensity).data[1], { label: "2026-01-11", value: 50, comparison: null });
  assert.equal(trendSeries(noDensity).unit, "m³");
});

test("formatDelta spells out the sign", () => {
  assert.equal(formatDelta(-1234.56, "t"), "−1,234.6 t");
  assert.equal(formatDelta(0, "m³"), "±0.0 m³");
  assert.equal(formatDelta(undefined, "t"), "—");
});

test("levels use the same minus sign as changes", () => {
  assert.equal(formatTonnes(-295.6), "−295.6 t");
  assert.equal(formatCubic(-12.34), "−12.3 m³");
  assert.equal(formatValue(-7390), "−7,390");
  assert.equal(formatTonnes(711.4), "711.4 t");
});
