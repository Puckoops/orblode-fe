import assert from "node:assert/strict";
import { test } from "node:test";
import { writeArrayBuffer } from "geotiff";

import { SNIFF_BYTES, epsgFromCrsName, geoJsonCrs, quickRead } from "../sniff.ts";
import "./fileReader.ts";

const featureCollection = (members: Record<string, unknown>) =>
  JSON.stringify({ type: "FeatureCollection", name: "polygons", ...members, features: [{ type: "Feature", properties: {}, geometry: null }] });

test("the ways GeoJSON names a CRS all come back as an EPSG code", () => {
  assert.equal(epsgFromCrsName("EPSG:28356"), "EPSG:28356");
  assert.equal(epsgFromCrsName("urn:ogc:def:crs:EPSG::28356"), "EPSG:28356");
  assert.equal(epsgFromCrsName("urn:ogc:def:crs:EPSG:6.6:7856"), "EPSG:7856");
  assert.equal(epsgFromCrsName("http://www.opengis.net/def/crs/EPSG/0/32756"), "EPSG:32756");
  assert.equal(epsgFromCrsName("urn:ogc:def:crs:OGC:1.3:CRS84"), "EPSG:4326");
  assert.equal(epsgFromCrsName("LOCAL_CS[\"site grid\"]"), null);
});

test("a GeoJSON's crs member names its CRS; without one it is WGS 84", () => {
  assert.equal(geoJsonCrs(featureCollection({ crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::28356" } } })), "EPSG:28356");
  assert.equal(geoJsonCrs(featureCollection({ crs: { type: "EPSG", properties: { code: 7856 } } })), "EPSG:7856");
  assert.equal(geoJsonCrs(featureCollection({})), "EPSG:4326");
  assert.equal(geoJsonCrs(featureCollection({ crs: null })), "EPSG:4326");
  assert.equal(geoJsonCrs(featureCollection({ crs: { type: "link", properties: { href: "x.prj" } } })), null);
});

test("a crs inside a feature's properties is not the file's", () => {
  const text = JSON.stringify({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { crs: { type: "name", properties: { name: "EPSG:28356" } } }, geometry: null }],
  });
  assert.equal(geoJsonCrs(text), "EPSG:4326");
});

test("a crs member after the features still counts while the text reaches it", () => {
  const text = `{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"note":"a \\"quoted\\" } brace"},"geometry":null}],"crs":{"type":"name","properties":{"name":"EPSG:32756"}}}`;
  assert.equal(geoJsonCrs(text), "EPSG:32756");
});

test("JSON that isn't GeoJSON names no CRS", () => {
  assert.equal(geoJsonCrs(JSON.stringify({ type: "Topology", objects: {} })), null);
});

test("only the first 64 KB of a GeoJSON file are read", async () => {
  const head = `{"type":"FeatureCollection","crs":{"type":"name","properties":{"name":"EPSG:28356"}},"features":[`;
  const big = new File([head, " ".repeat(SNIFF_BYTES * 2), "]}"], "Mine_Site_Polygons_of_interest.json");
  assert.deepEqual(await quickRead(big), { role: null, crs: "EPSG:28356" });

  const late = new File([`{"type":"FeatureCollection","features":[`, " ".repeat(SNIFF_BYTES), `],"crs":{"type":"name","properties":{"name":"EPSG:28356"}}}`], "late.geojson");
  assert.deepEqual(await quickRead(late), { role: null, crs: "EPSG:4326" });
});

test("KML is WGS 84; a GeoTIFF says its role and GeoKeys CRS; other files say nothing", async () => {
  assert.deepEqual(await quickRead(new File(["<kml/>"], "boundary.kml")), { role: null, crs: "EPSG:4326" });
  const tiff = writeArrayBuffer(new Float32Array(16), {
    width: 4,
    height: 4,
    BitsPerSample: [32],
    SampleFormat: [3],
    GTModelTypeGeoKey: 1,
    ProjectedCSTypeGeoKey: 7856,
    ModelPixelScale: [1, 1, 0],
    ModelTiepoint: [0, 0, 0, 444605, 6452779, 0],
  });
  assert.deepEqual(await quickRead(new File([tiff], "surface.tif")), { role: "dsm", crs: "EPSG:7856" });
  assert.deepEqual(await quickRead(new File(["x"], "cloud.laz")), { role: null, crs: null });
});
