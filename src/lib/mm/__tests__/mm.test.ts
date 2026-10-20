import { test } from "node:test";
import assert from "node:assert/strict";
import { boundaryAreaM2, BoundaryError, centreOf, parseDxf, parseGeoJson, parsePillarsCsv } from "../boundary.ts";
import { gcpCsv, litchiCsv, missionPack } from "../exports.ts";
import { thousands } from "../format.ts";
import { fromUtm, toUtm } from "../utm.ts";
import { crc32 } from "../zip.ts";
import type { Mission, MissionGeometry } from "../../api/mm.ts";

test("UTM round-trips to about a millimetre", () => {
  const u = toUtm(85.8301, 20.6612);
  assert.equal(u.zone, 45);
  assert.equal(u.north, true);
  const back = fromUtm(u.easting, u.northing, u.zone, u.north);
  assert.ok(Math.abs(back.lon - 85.8301) < 1e-8 && Math.abs(back.lat - 20.6612) < 1e-8);
});

test("a known point's UTM coordinates", () => {
  // PROJ's EPSG:32645 for this point is 377261.529, 2244685.064.
  const u = toUtm(85.8245, 20.2961);
  assert.ok(Math.abs(u.easting - 377_261.529) < 0.001, `easting ${u.easting}`);
  assert.ok(Math.abs(u.northing - 2_244_685.064) < 0.001, `northing ${u.northing}`);
});

test("a CSV of pillars in degrees, with a header", () => {
  const b = parsePillarsCsv("pillar,lon,lat\nBP1,85.83,20.66\nBP2,85.832,20.66\nBP3,85.832,20.662\nBP4,85.83,20.662\n");
  assert.equal(b.pillars, 4);
  assert.equal(b.geometry.type, "Polygon");
  const area = boundaryAreaM2(b.geometry);
  assert.ok(Math.abs(area - 46_147) < 150, `area ${area}`);
});

test("a CSV of pillars in eastings needs its zone", () => {
  const csv = "BP1,378412.3,2297108.8\nBP2,378905.7,2297331.1\nBP3,379266.0,2296870.4\n";
  assert.throws(() => parsePillarsCsv(csv), BoundaryError);
  const b = parsePillarsCsv(csv, { zone: 45, north: true });
  const [lon, lat] = (b.geometry.coordinates as [number, number][][])[0][0];
  assert.ok(lon > 85 && lon < 86 && lat > 20 && lat < 21, `${lon},${lat}`);
});

test("closed LWPOLYLINEs of a DXF", () => {
  const dxf = ["0", "SECTION", "2", "ENTITIES", "0", "LWPOLYLINE", "8", "LEASE", "70", "1", "10", "0", "20", "0", "10", "100", "20", "0", "10", "100", "20", "100", "0", "ENDSEC", "0", "EOF"].join("\n");
  const b = parseDxf(dxf, { zone: 45, north: true });
  assert.equal(b.pillars, 3);
});

test("a GeoJSON feature collection's polygons", () => {
  const b = parseGeoJson(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0]]] } }] }));
  assert.equal(b.pillars, 3);
  assert.throws(() => parseGeoJson('{"type":"Point","coordinates":[0,0]}'), BoundaryError);
});

test("numbers use thin spaces", () => {
  assert.equal(thousands(38420), "38 420");
  assert.equal(thousands(-2480), "−2 480");
  assert.equal(thousands(1234.5, 2), "1 234.50");
});

test("crc32 of a known string", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

const mission = {
  code: "MP-OD-POST",
  season: "post",
  settings: { altitude_m: 100, front_overlap: 80, side_overlap: 70, speed_ms: 8, buffer_m: 50, safety_zone_m: 30 },
  stats: { lines: 2, gsd_cm: 2.74, trigger_m: 20, batteries: 1 },
  gcps: [{ id: "G1", role: "gcp", where: "Corner 1", auto: { lon: 85.83, lat: 20.66 }, final: { lon: 85.8301, lat: 20.66 }, moved_m: 10.4, bearing: "E", reason: "Standing water or wet sand" }],
  checks: [{ key: "gsd", label: "GSD", state: "ok", detail: "2.74 cm" }],
} as unknown as Mission;
const geometry = {
  lease: { type: "Polygon", coordinates: [[[85.83, 20.66], [85.832, 20.66], [85.832, 20.662], [85.83, 20.66]]] },
  buffer: { type: "Polygon", coordinates: [[[85.829, 20.659], [85.833, 20.659], [85.833, 20.663], [85.829, 20.659]]] },
  safety: { type: "Polygon", coordinates: [[[85.828, 20.658], [85.834, 20.658], [85.834, 20.664], [85.828, 20.658]]] },
  nogo: [],
  lines: [
    [{ lon: 85.83, lat: 20.66 }, { lon: 85.832, lat: 20.66 }],
    [{ lon: 85.832, lat: 20.6602 }, { lon: 85.83, lat: 20.6602 }],
  ],
} as unknown as MissionGeometry;

test("Litchi waypoints are each line's ends, camera straight down", () => {
  const rows = litchiCsv(mission, geometry).trim().split("\n");
  assert.equal(rows.length, 5);
  assert.ok(rows[1].includes(",-90,") && rows[1].endsWith(",20.0"));
});

test("the GCP layout keeps both positions and the reason", () => {
  const rows = gcpCsv(mission.gcps).trim().split("\n");
  assert.equal(rows.length, 2);
  assert.ok(rows[1].includes("20.66000000,85.83000000,20.66000000,85.83010000") && rows[1].includes("Standing water"));
});

test("the mission pack is a ZIP of four files", () => {
  const z = missionPack(mission, geometry, "Odapada Ghat", "SkyMap Odisha", "SM-D1");
  assert.equal(new DataView(z.buffer).getUint32(0, true), 0x04034b50);
  const end = new DataView(z.buffer, z.length - 22);
  assert.equal(end.getUint16(10, true), 4);
});

test("a KML's polygons, namespaced or not", async () => {
  const { parseKml } = await import("../boundary.ts");
  const kml = `<kml><Document><Placemark><kml:Polygon><kml:outerBoundaryIs><kml:LinearRing><kml:coordinates>85.83,20.66,0 85.832,20.66,0 85.832,20.662,0 85.83,20.66,0</kml:coordinates></kml:LinearRing></kml:outerBoundaryIs></kml:Polygon></Placemark></Document></kml>`;
  assert.equal(parseKml(kml).pillars, 3);
});

test("a ZIP written here reads back, and so does a deflated one", async () => {
  const { unzip, zip } = await import("../zip.ts");
  const files = await unzip(zip([{ name: "doc.kml", data: "<kml/>" }]));
  assert.equal(new TextDecoder().decode(files.get("doc.kml")), "<kml/>");
  const deflated = Uint8Array.from(atob("UEsDBBQAAAAIACeAU11Xgb7lDgAAANMAAAAHAAAAZG9jLmttbLPJzs2xqxgmwEYf5BsAUEsBAhQDFAAAAAgAJ4BTXVeBvuUOAAAA0wAAAAcAAAAAAAAAAAAAAIABAAAAAGRvYy5rbWxQSwUGAAAAAAEAAQA1AAAAMwAAAAAA"), (c) => c.charCodeAt(0));
  const kmz = await unzip(deflated);
  assert.equal(new TextDecoder().decode(kmz.get("doc.kml")), `<kml>${"x".repeat(200)}</kml>`);
});

test("a boundary's centre is the mean of its outer corners, the closing corner counted once", () => {
  const square: [number, number][] = [
    [85, 20],
    [85.02, 20],
    [85.02, 20.02],
    [85, 20.02],
    [85, 20],
  ];
  const c = centreOf({ type: "Polygon", coordinates: [square] });
  assert.ok(c && Math.abs(c.lon - 85.01) < 1e-9 && Math.abs(c.lat - 20.01) < 1e-9);
  assert.equal(centreOf({ type: "MultiPolygon", coordinates: [] }), null);
});
