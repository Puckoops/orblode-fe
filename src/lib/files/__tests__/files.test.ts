import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl, downloadUrl, filesUrlsIn, fromFilesUrl, toFilesUrl } from "../index.ts";

const BUCKET = "puckoops-shared";
const KEY = "orblode/clients/c-1/processed/terrain/wf-1/tiles/{z}/{x}/{y}.png";
const STORED = `https://storage.googleapis.com/${BUCKET}/${KEY}`;

test("a stored object URL maps onto /files/<key>, dropping the bucket", () => {
  assert.equal(toFilesUrl(STORED), `/files/${KEY}`);
});

test("gs:// URLs map the same way as https ones", () => {
  assert.equal(toFilesUrl(`gs://${BUCKET}/orblode/clients/c-1/original/s-1/site.tif`), "/files/orblode/clients/c-1/original/s-1/site.tif");
});

test("URLs outside the bucket host are left alone", () => {
  for (const url of ["https://example.com/a.png", "/cesium/Assets/x.png", "", "https://storage.googleapis.com/only-bucket"]) {
    assert.equal(toFilesUrl(url), url);
  }
});

test("a /files/ path maps back to the exact stored URL it came from", () => {
  const local = toFilesUrl(STORED);
  assert.equal(fromFilesUrl(local), STORED);
});

test("query strings survive both directions and do not confuse the bucket lookup", () => {
  const stored = `https://storage.googleapis.com/other-bucket/orblode/clients/c-2/x.json?alt=media`;
  const local = toFilesUrl(stored);
  assert.equal(local, "/files/orblode/clients/c-2/x.json?alt=media");
  assert.equal(fromFilesUrl(local), stored);
});

test("an unseen /files/ key falls back to the most recently seen bucket", () => {
  toFilesUrl(`https://storage.googleapis.com/${BUCKET}/orblode/clients/c-1/a.tif`);
  assert.equal(fromFilesUrl("/files/orblode/clients/c-1/never-seen.tif"), `https://storage.googleapis.com/${BUCKET}/orblode/clients/c-1/never-seen.tif`);
});

test("fromFilesUrl leaves other URLs alone", () => {
  assert.equal(fromFilesUrl("https://example.com/x"), "https://example.com/x");
});

test("filesUrlsIn rewrites nested manifest values and nothing else", () => {
  const manifest = {
    survey: { id: "s-1", status: "ready" },
    layers: { terrain: [{ tile_directory_url: STORED, bbox: [1, 2, 3, 4] }], ortho: null },
    count: 3,
  };
  const out = filesUrlsIn(manifest);
  assert.equal(out.layers.terrain[0].tile_directory_url, `/files/${KEY}`);
  assert.deepEqual(out.layers.terrain[0].bbox, [1, 2, 3, 4]);
  assert.equal(out.layers.ortho, null);
  assert.equal(out.count, 3);
  assert.deepEqual(out.survey, manifest.survey);
});

test("downloadUrl asks the files proxy for a signed download", () => {
  assert.equal(downloadUrl(STORED), `/files/${KEY}?download=1`);
  assert.equal(downloadUrl(`https://storage.googleapis.com/${BUCKET}/a.tif?x=1`), "/files/a.tif?x=1&download=1");
  assert.equal(downloadUrl("https://example.com/a.tif"), null);
  assert.equal(downloadUrl(undefined), null);
});

test("canonicalUrl turns gs:// and /files/ forms into the stored https URL", () => {
  assert.equal(canonicalUrl(`gs://${BUCKET}/k.tif`), `https://storage.googleapis.com/${BUCKET}/k.tif`);
  assert.equal(canonicalUrl(toFilesUrl(STORED)), STORED);
  assert.equal(canonicalUrl(undefined), null);
});
