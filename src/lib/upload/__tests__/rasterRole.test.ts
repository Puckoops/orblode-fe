import { test } from "node:test";
import assert from "node:assert/strict";
import { writeArrayBuffer } from "geotiff";
import type { FileRole } from "../planner.ts";
import { readRasterRole, refineRoles } from "../rasterRole.ts";

// geotiff's fromBlob reads through FileReader, which browsers have and Node doesn't.
class BlobReader {
  result: ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  onabort: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then(
      (buf) => {
        this.result = buf;
        this.onload?.();
      },
      (err) => this.onerror?.(err)
    );
  }
  abort() {}
}
globalThis.FileReader ??= BlobReader as unknown as typeof FileReader;

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
