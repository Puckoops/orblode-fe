import { test } from "node:test";
import assert from "node:assert/strict";

import type { Measurement } from "../../api/orblodeSvc.ts";
import {
  exportItem,
  fileStem,
  isExportable,
  kmlColour,
  measurementsCsv,
  measurementsDxf,
  measurementsGeoJson,
  measurementsKml,
  vertexHeights,
  type ExportItem,
} from "../measurementExport.ts";

const square = [
  [151.2, -33.9],
  [151.201, -33.9],
  [151.201, -33.901],
  [151.2, -33.901],
  [151.2, -33.9],
];

function stockpile(over: Partial<Measurement> = {}): Measurement {
  return {
    id: "m1",
    client_id: "c1",
    survey_id: "s1",
    kind: "stockpile",
    name: "Coal pile A",
    geometry: { type: "Polygon", coordinates: [square] },
    params: {
      from: { type: "smart_base" },
      material: { name: "Coal", density_t_m3: 0.85 },
      style: { stroke: "#C97A4E" },
    },
    status: "completed",
    results: { stockpile: { version: 1, metrics: { volume_m3: 1234.56789, tonnage_t: 1049.3827, area_m2: 1200.2 } } },
    created_at: 1_760_000_000_000,
    updated_at: 1_760_000_000_000,
    computed_at: 1_760_000_100_000,
    ...over,
  };
}

const item = (over: Partial<Measurement> = {}, plan: Record<string, number> = { area_m2: 1190, perimeter_m: 140 }): ExportItem =>
  exportItem(stockpile(over), plan);

test("only a saved measurement with a shape exports", () => {
  assert.equal(isExportable(stockpile()), true);
  assert.equal(isExportable(stockpile({ draft: false })), true);
  assert.equal(isExportable(stockpile({ draft: true })), false);
  assert.equal(isExportable(stockpile({ geometry: undefined })), false);
});

test("a computed stockpile exports its computed values over the outline's plan values", () => {
  const it = item();
  assert.equal(it.basis, "computed");
  assert.equal(it.metrics.volume_m3, 1234.56789);
  assert.equal(it.metrics.area_m2, 1200.2);
  assert.equal(it.metrics.perimeter_m, 140);
  assert.equal(it.material, "Coal");
  assert.equal(it.densityTM3, 0.85);
  assert.equal(it.baseMethod, "smart-base");
  assert.equal(it.computedAt, 1_760_000_100_000);
  assert.equal(it.stroke, "#C97A4E");
});

test("a stockpile leaves out the cut, fill and net that restate its volume; a cut/fill keeps them", () => {
  const splits = { volume_m3: 280.4, cut_volume_m3: 0.3, fill_volume_m3: 280.7, net_change_m3: 280.4, area_m2: 223 };
  const pile = exportItem(stockpile({ results: { stockpile: { metrics: splits } } }), {});
  assert.deepEqual(Object.keys(pile.metrics).sort(), ["area_m2", "volume_m3"]);
  const cutFill = exportItem(stockpile({ kind: "cut_fill", results: { cut_fill: { metrics: splits } } }), {});
  assert.equal(cutFill.metrics.fill_volume_m3, 280.7);
  assert.equal(cutFill.metrics.net_change_m3, 280.4);
});

test("a polygon with nothing computed exports its plan values and no compute time", () => {
  const it = exportItem(stockpile({ kind: "area", results: undefined, result: undefined, params: {} }), { area_m2: 1190, perimeter_m: 140 });
  assert.equal(it.basis, "plan");
  assert.deepEqual(it.metrics, { area_m2: 1190, perimeter_m: 140 });
  assert.equal(it.computedAt, null);
  assert.equal(it.material, null);
});

test("the CSV has one row per measurement under a fixed header, quoting names that need it", () => {
  const csv = measurementsCsv([item(), item({ id: "m2", name: 'Pile "B", north' })], "2026-10-01");
  const [head, first, second] = csv.trimEnd().split("\r\n");
  assert.equal(
    head,
    "name,kind,survey_date,folder,material,density_t_m3,volume_m3,adjusted_volume_m3,tonnage_t,value,cut_volume_m3,fill_volume_m3,net_change_m3,area_m2,perimeter_m,length_m,basis,computed_at,base_method"
  );
  assert.equal(first, "Coal pile A,stockpile,2026-10-01,,Coal,0.85,1234.568,,1049.383,,,,,1200.2,140,,computed,2025-10-09T08:55:00.000Z,smart-base");
  assert.ok(second.startsWith('"Pile ""B"", north",stockpile'));
});

test("an empty CSV still has its header", () => {
  assert.ok(measurementsCsv([], "2026-10-01").startsWith("name,kind,survey_date,"));
});

test("GeoJSON is a feature collection in WGS 84 with the values as properties", () => {
  const fc = JSON.parse(measurementsGeoJson([item()], "2026-10-01"));
  assert.equal(fc.type, "FeatureCollection");
  assert.equal(fc.features.length, 1);
  const [f] = fc.features;
  assert.equal(f.id, "m1");
  assert.equal(f.geometry.type, "Polygon");
  assert.deepEqual(f.geometry.coordinates[0][1], [151.201, -33.9]);
  assert.equal(f.properties.name, "Coal pile A");
  assert.equal(f.properties.volume_m3, 1234.568);
  assert.equal(f.properties.survey_date, "2026-10-01");
});

test("KML colours are alpha, blue, green, red", () => {
  assert.equal(kmlColour("#C97A4E", 1), "ff4e7ac9");
  assert.equal(kmlColour("#C97A4E", 0.25), "404e7ac9");
  assert.equal(kmlColour("#fff", 1), "ffffffff");
});

test("KML clamps each outline to the ground and escapes names and values", () => {
  const kml = measurementsKml([item({ name: "Pile <A> & B" })], "Survey of 2026-10-01", "2026-10-01");
  assert.ok(kml.includes("<name>Pile &lt;A&gt; &amp; B</name>"));
  assert.ok(kml.includes("<altitudeMode>clampToGround</altitudeMode>"));
  assert.ok(kml.includes("<coordinates>151.2,-33.9,0 151.201,-33.9,0"));
  assert.ok(kml.includes('<Data name="volume_m3"><displayName>Volume (m³)</displayName><value>1234.568</value></Data>'));
  assert.ok(!kml.includes('name="folder"'), "empty attributes are left out");
});

const shift = ([lon, lat]: [number, number]): [number, number] => [(lon - 151) * 100_000, (lat + 34) * 100_000];

test("DXF writes a closed 3D polyline in the working CRS when every vertex has a height", () => {
  const dxf = measurementsDxf([item()], shift, new Map([["m1", [[10, 11, 12, 13, 10]]]])).split("\n");
  const polyline = dxf.indexOf("POLYLINE");
  assert.ok(polyline > 0);
  assert.equal(dxf[polyline + 2], "Coal_pile_A");
  assert.equal(dxf[polyline + 6], "9", "closed (1) + 3D (8)");
  assert.equal(dxf.filter((l) => l === "VERTEX").length, 4, "the repeated closing vertex is dropped");
  const firstVertex = dxf.indexOf("VERTEX");
  assert.deepEqual(dxf.slice(firstVertex + 3, firstVertex + 9), ["10", "20000.0000", "20", "10000.0000", "30", "10.0000"]);
});

test("DXF falls back to a flat polyline when a vertex has no height", () => {
  const dxf = measurementsDxf([item()], shift, new Map([["m1", [[10, null, 12, 13, 10]]]])).split("\n");
  assert.equal(dxf[dxf.indexOf("POLYLINE") + 6], "1");
  assert.ok(!dxf.includes("32"), "no 3D vertex flags");
});

test("DXF labels each outline with its name and headline value, escaping what R12 can't hold", () => {
  const dxf = measurementsDxf([item({ name: "Pile → north" })], shift).split("\n");
  const texts = dxf.flatMap((l, i) => (l === "TEXT" ? [dxf[i + 12]] : []));
  assert.deepEqual(texts, ["Pile \\U+2192 north", "1234.6 m3"]);
});

test("DXF writes a point measurement as a POINT", () => {
  const dxf = measurementsDxf([item({ kind: "point", geometry: { type: "Point", coordinates: [151.2, -33.9] }, results: undefined })], shift);
  assert.ok(dxf.includes("POINT\n8\nCoal_pile_A\n10\n20000.0000\n20\n10000.0000\n30\n0.0000"));
});

test("vertex heights come from the station nearest each vertex's chainage", () => {
  assert.deepEqual(vertexHeights([0, 10, 20.0004], [0, 5, 10, 20], [1, 2, 3, 4]), [1, 3, 4]);
  assert.deepEqual(vertexHeights([0, 10], [0, 10], [null, 3]), [null, 3]);
  assert.deepEqual(vertexHeights([0, 10], [0, 9.5], [1, 2]), [1, null], "a station too far away gives no height");
  assert.deepEqual(vertexHeights([0, 10], [0, 10], undefined), [null, null]);
});

test("file stems are lower-case words joined by dashes", () => {
  assert.equal(fileStem("Coal pile A"), "coal-pile-a");
  assert.equal(fileStem("  ***  "), "measurement");
});
