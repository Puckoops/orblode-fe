import assert from "node:assert/strict";
import { test } from "node:test";

import type { InitiatedUpload, SourceAsset, UploadInitFile } from "@/lib/api/orblodeSvc";
import { uploadFiles, type AssetSlot, type UploadApi, type UploadFileStatus } from "../pipeline.ts";

const noSleep = async () => {};

function fakeApi(overrides: Partial<UploadApi> = {}) {
  const calls = { init: [] as UploadInitFile[][], put: [] as string[], mark: [] as string[] };
  const api: UploadApi = {
    initUploads: async (surveyId, files) => {
      calls.init.push(files);
      return {
        uploads: files.map(
          (f): InitiatedUpload => ({
            asset: { id: `asset-${f.filename}`, filename: f.filename, url: `gs://b/${f.filename}` } as SourceAsset,
            upload_url: `https://signed/${f.filename}`,
          })
        ),
      };
    },
    putToSignedUrl: async (signedUrl, _file, _contentType, onProgress) => {
      calls.put.push(signedUrl);
      onProgress(1);
    },
    markAssetUploaded: async (_surveyId, assetId) => {
      calls.mark.push(assetId);
      return { id: assetId, detection: { status: "inspecting" } } as SourceAsset;
    },
    ...overrides,
  };
  return { api, calls };
}

const file = (name: string) => new File(["bytes"], name);

const slot = (name: string, uploaded: boolean, marked: boolean): AssetSlot => ({
  assetId: `asset-${name}`,
  url: `gs://b/${name}`,
  uploadUrl: `https://signed/${name}`,
  uploaded,
  marked,
});

const markedSlot = (name: string): AssetSlot => ({
  ...slot(name, true, true),
  asset: { id: `asset-${name}`, detection: { status: "inspecting" } } as SourceAsset,
});

test("mints slots, uploads and marks every file, reporting each as uploaded", async () => {
  const { api, calls } = fakeApi();
  const slots: Record<string, AssetSlot> = {};
  const statuses: [string, UploadFileStatus][] = [];
  await uploadFiles(api, {
    surveyId: "s1",
    files: [
      { file: file("dsm.tif"), kind: "terrain", role: "dsm", crs: "EPSG:7856" },
      { file: file("cloud.laz"), kind: "pointcloud", role: "pointcloud", crs: "EPSG:7856" },
    ],
    slots,
    onStatus: (name, status) => statuses.push([name, status]),
  });
  assert.deepEqual(calls.init, [
    [
      { filename: "dsm.tif", kind: "terrain", role: "dsm", content_type: "image/tiff", crs: "EPSG:7856" },
      { filename: "cloud.laz", kind: "pointcloud", role: "pointcloud", content_type: "application/octet-stream", crs: "EPSG:7856" },
    ],
  ]);
  assert.deepEqual(calls.put, ["https://signed/dsm.tif", "https://signed/cloud.laz"]);
  assert.deepEqual(calls.mark, ["asset-dsm.tif", "asset-cloud.laz"]);
  assert.deepEqual(slots["dsm.tif"], markedSlot("dsm.tif"));
  assert.deepEqual(statuses, [
    ["dsm.tif", "uploading"],
    ["dsm.tif", "uploaded"],
    ["cloud.laz", "uploading"],
    ["cloud.laz", "uploaded"],
  ]);
});

test("the upload's fallbacks go out as declared_*, never as the file's own crs", async () => {
  const { api, calls } = fakeApi();
  await uploadFiles(api, {
    surveyId: "s1",
    files: [
      { file: file("contours.dxf"), kind: "vector", role: "contours", declaredCrs: "EPSG:28356", declaredVerticalDatum: "AHD" },
      { file: file("dsm.tif"), kind: "terrain", role: "dsm" },
    ],
    slots: {},
  });
  assert.deepEqual(calls.init[0], [
    {
      filename: "contours.dxf",
      kind: "vector",
      role: "contours",
      content_type: "application/octet-stream",
      declared_crs: "EPSG:28356",
      declared_vertical_datum: "AHD",
    },
    { filename: "dsm.tif", kind: "terrain", role: "dsm", content_type: "image/tiff" },
  ]);
});

test("a replacement asks for its slot with the asset it replaces", async () => {
  const { api, calls } = fakeApi();
  await uploadFiles(api, {
    surveyId: "s1",
    files: [{ file: file("dsm-v2.tif"), kind: "terrain", role: "dsm", crs: "EPSG:7856", replaces: "old-dsm" }],
    slots: {},
  });
  assert.equal(calls.init[0][0].replaces, "old-dsm");
});

test("a retry resumes: no second slot, no re-sent bytes, only the missing mark", async () => {
  const { api, calls } = fakeApi();
  const slots = { "a.tif": slot("a.tif", true, true), "b.tif": slot("b.tif", true, false) };
  await uploadFiles(api, {
    surveyId: "s1",
    files: [
      { file: file("a.tif"), kind: "terrain", role: "dsm" },
      { file: file("b.tif"), kind: "terrain", role: "dtm" },
      { file: file("c.tif"), kind: "ortho", role: "ortho" },
    ],
    slots,
  });
  assert.deepEqual(
    calls.init.map((files) => files.map((f) => f.filename)),
    [["c.tif"]]
  );
  assert.deepEqual(calls.put, ["https://signed/c.tif"]);
  assert.deepEqual(calls.mark, ["asset-b.tif", "asset-c.tif"]);
  assert.deepEqual(slots["b.tif"], markedSlot("b.tif"));
});

test("a failed upload reports the file as failed, rethrows, and keeps its slot for the retry", async () => {
  let fail = true;
  const { api, calls } = fakeApi({
    putToSignedUrl: async () => {
      if (fail) throw new Error("upload stalled");
    },
  });
  const slots: Record<string, AssetSlot> = {};
  const statuses: UploadFileStatus[] = [];
  const run = {
    surveyId: "s1",
    files: [{ file: file("a.tif"), kind: "terrain", role: "dsm" }],
    slots,
    onStatus: (_name: string, status: UploadFileStatus) => statuses.push(status),
  };
  await assert.rejects(uploadFiles(api, run), /upload stalled/);
  assert.deepEqual(statuses, ["uploading", "error"]);
  assert.deepEqual(slots["a.tif"], slot("a.tif", false, false));

  fail = false;
  await uploadFiles(api, run);
  assert.equal(calls.init.length, 1);
  assert.deepEqual(slots["a.tif"], markedSlot("a.tif"));
});

test("marking uploaded is retried through a transient failure", async () => {
  let attempts = 0;
  const { api } = fakeApi({
    markAssetUploaded: async (_surveyId, assetId) => {
      attempts++;
      if (attempts < 2) throw Object.assign(new Error("http 503"), { status: 503 });
      return { id: assetId } as SourceAsset;
    },
  });
  const slots: Record<string, AssetSlot> = {};
  await uploadFiles(api, { surveyId: "s1", files: [{ file: file("a.tif"), kind: "terrain", role: "dsm" }], slots }, { sleep: noSleep });
  assert.equal(attempts, 2);
  assert.equal(slots["a.tif"].marked, true);
});

test("a file the server returned no slot for fails the run", async () => {
  const { api } = fakeApi({ initUploads: async () => ({ uploads: [] }) });
  await assert.rejects(
    uploadFiles(api, { surveyId: "s1", files: [{ file: file("a.tif"), kind: "terrain", role: "dsm" }], slots: {} }),
    /No upload slot returned for a\.tif/
  );
});
