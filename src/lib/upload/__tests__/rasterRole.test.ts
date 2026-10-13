import { test } from "node:test";
import assert from "node:assert/strict";
import { writeArrayBuffer } from "geotiff";
import type { FileRole } from "../planner.ts";
import { crsFromGeoKeys, readRasterHeader, readRasterRole, refineRoles } from "../rasterRole.ts";
import "./fileReader.ts";

const rgbOrtho = () =>
  writeArrayBuffer(new Uint8Array(4 * 4 * 3), { width: 4, height: 4, SamplesPerPixel: 3, BitsPerSample: [8, 8, 8], PhotometricInterpretation: 2 });
const floatDsm = () => writeArrayBuffer(new Float32Array(16), { width: 4, height: 4, BitsPerSample: [32], SampleFormat: [3] });
const uint16Dsm = () => writeArrayBuffer(new Uint16Array(16), { width: 4, height: 4, BitsPerSample: [16] });

test("the header tells an RGB orthophoto from a float or 16-bit surface", async () => {
  assert.equal(await readRasterRole(new Blob([rgbOrtho()])), "ortho");
  assert.equal(await readRasterRole(new Blob([floatDsm()])), "dsm");
  assert.equal(await readRasterRole(new Blob([uint16Dsm()])), "dsm");
});

test("a file that isn't a readable TIFF has no header role", async () => {
  assert.equal(await readRasterRole(new Blob(["not a tiff"])), null);
});

test("only GeoTIFFs whose names give no hint have their headers read", async () => {
  const settled: [string, FileRole | null][] = [];
  await refineRoles(
    [
      new File([rgbOrtho()], "Mine_Site_2026-10-11_GeoTIFF_GDA94_MGA_zone_56.tiff"),
      new File([floatDsm()], "Mine_Site_2026-10-11_DSM_GDA94_MGA_zone_56.tiff"),
      new File([rgbOrtho()], "site_dsm.tif"),
      new File(["x"], "cloud.laz"),
    ],
    "preprocessed",
    (file, role) => settled.push([file.name, role])
  );
  assert.deepEqual(settled, [["Mine_Site_2026-10-11_GeoTIFF_GDA94_MGA_zone_56.tiff", "ortho"]]);
});

// writeArrayBuffer writes GeographicTypeGeoKey 4326 unless a projected or geographic key is given. It
// writes VerticalCSTypeGeoKey too, though its metadata type leaves the key out.
const mgaDsm = () =>
  writeArrayBuffer(new Float32Array(16), {
    width: 4,
    height: 4,
    BitsPerSample: [32],
    SampleFormat: [3],
    GTModelTypeGeoKey: 1,
    ProjectedCSTypeGeoKey: 28356,
    ModelPixelScale: [1, 1, 0],
    ModelTiepoint: [0, 0, 0, 444605, 6452779, 0],
    ...({ VerticalCSTypeGeoKey: 5711 } as object),
  });

test("the header names its projected CRS and vertical datum from the GeoKeys", async () => {
  assert.deepEqual(await readRasterHeader(new Blob([mgaDsm()])), { role: "dsm", crs: "EPSG:28356", verticalCrs: "EPSG:5711" });
});

test("a GeoTIFF with only a geographic GeoKey reads as that CRS", async () => {
  assert.deepEqual(await readRasterHeader(new Blob([rgbOrtho()])), { role: "ortho", crs: "EPSG:4326", verticalCrs: null });
});

test("a user-defined or missing GeoKey names no CRS", () => {
  assert.deepEqual(crsFromGeoKeys({ ProjectedCSTypeGeoKey: 32767, GeographicTypeGeoKey: 32767 }), { crs: null, verticalCrs: null });
  assert.deepEqual(crsFromGeoKeys({ ProjectedCSTypeGeoKey: 32767, GeographicTypeGeoKey: 4283 }), { crs: "EPSG:4283", verticalCrs: null });
  assert.deepEqual(crsFromGeoKeys(null), { crs: null, verticalCrs: null });
});
