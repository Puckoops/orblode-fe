import assert from "node:assert/strict";
import { test } from "node:test";

import type { InitiatedUpload, SourceAsset, UploadInitFile } from "@/lib/api/orblodeSvc";
import { uploadFiles, type AssetSlot, type UploadApi, type UploadFileStatus } from "../pipeline.ts";

const noSleep = async () => {};
const MINUTE = 60_000;
const atZero = { now: () => 0 };

function fakeApi(overrides: Partial<UploadApi> = {}) {
  const calls = { init: [] as UploadInitFile[][], put: [] as string[], mark: [] as string[], remove: [] as string[] };
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
    removeAsset: async (_surveyId, assetId) => {
      calls.remove.push(assetId);
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
  expiresAt: 30 * MINUTE,
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
  await uploadFiles(
    api,
    {
      surveyId: "s1",
      files: [
        { file: file("dsm.tif"), kind: "terrain", role: "dsm", crs: "EPSG:7856" },
        { file: file("cloud.laz"), kind: "pointcloud", role: "pointcloud", crs: "EPSG:7856" },
      ],
      slots,
      onStatus: (name, status) => statuses.push([name, status]),
    },
    atZero
  );
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

test("a retry resumes: no second slot, no re-sent bytes, only the missing mark, however old the slots", async () => {
  const { api, calls } = fakeApi();
  const slots = { "a.tif": slot("a.tif", true, true), "b.tif": slot("b.tif", true, false) };
  await uploadFiles(
    api,
    {
      surveyId: "s1",
      files: [
        { file: file("a.tif"), kind: "terrain", role: "dsm" },
        { file: file("b.tif"), kind: "terrain", role: "dtm" },
        { file: file("c.tif"), kind: "ortho", role: "ortho" },
      ],
      slots,
    },
    { now: () => 60 * MINUTE }
  );
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
  await assert.rejects(uploadFiles(api, run, atZero), /upload stalled/);
  assert.deepEqual(statuses, ["uploading", "error"]);
  assert.deepEqual(slots["a.tif"], slot("a.tif", false, false));

  fail = false;
  await uploadFiles(api, run, atZero);
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
  await uploadFiles(api, { surveyId: "s1", files: [{ file: file("a.tif"), kind: "terrain", role: "dsm" }], slots }, { retry: { sleep: noSleep } });
  assert.equal(attempts, 2);
  assert.equal(slots["a.tif"].marked, true);
});

/** The server and the bucket on one clock. Signatures last 30 minutes and storage refuses a PUT that arrives after
 * its signature lapsed, as GCS does. Each PUT takes `putMinutes`; the first `stalls` of them die after that long. A
 * replacement is a new asset each time it is signed (orblode-svc keys it by the new asset's id); any other file keeps
 * its asset, since the svc upserts by object URL. */
function clockedApi({ putMinutes, stalls = 0 }: { putMinutes: number; stalls?: number }) {
  const clock = { now: 0 };
  const signedAt = new Map<string, number>();
  let signings = 0;
  const fake = fakeApi({
    initUploads: async (_surveyId, files) => {
      fake.calls.init.push(files);
      return {
        uploads: files.map((f): InitiatedUpload => {
          const n = ++signings;
          const id = f.replaces ? `asset-${f.filename}-${n}` : `asset-${f.filename}`;
          const uploadUrl = `https://signed/${f.filename}?X-Goog-Expires=1800&n=${n}`;
          signedAt.set(uploadUrl, clock.now);
          return { asset: { id, filename: f.filename, url: `gs://b/${id}` } as SourceAsset, upload_url: uploadUrl };
        }),
      };
    },
    putToSignedUrl: async (signedUrl) => {
      fake.calls.put.push(signedUrl);
      if (clock.now >= signedAt.get(signedUrl)! + 30 * MINUTE) throw new Error("upload failed (400): ExpiredToken");
      clock.now += putMinutes * MINUTE;
      if (stalls-- > 0) throw new Error("upload stalled");
    },
  });
  return { ...fake, clock, opts: { now: () => clock.now } };
}

test("a long batch signs again a file whose URL would lapse before its turn", async () => {
  const { api, calls, opts } = clockedApi({ putMinutes: 20 });
  const slots: Record<string, AssetSlot> = {};
  await uploadFiles(
    api,
    {
      surveyId: "s1",
      files: [
        { file: file("a.tif"), kind: "terrain", role: "dsm" },
        { file: file("b.tif"), kind: "terrain", role: "dtm" },
        { file: file("c.tif"), kind: "ortho", role: "ortho" },
      ],
      slots,
    },
    opts
  );
  assert.deepEqual(
    calls.init.map((files) => files.map((f) => f.filename)),
    [["a.tif", "b.tif", "c.tif"], ["c.tif"]]
  );
  assert.deepEqual(calls.put, [
    "https://signed/a.tif?X-Goog-Expires=1800&n=1",
    "https://signed/b.tif?X-Goog-Expires=1800&n=2",
    "https://signed/c.tif?X-Goog-Expires=1800&n=4",
  ]);
  assert.deepEqual(calls.mark, ["asset-a.tif", "asset-b.tif", "asset-c.tif"]);
  assert.deepEqual(calls.remove, []);
});

test("a URL with under five minutes left is signed again too, not sent to lapse mid-request", async () => {
  const { api, calls, opts } = clockedApi({ putMinutes: 26 });
  await uploadFiles(
    api,
    {
      surveyId: "s1",
      files: [
        { file: file("a.tif"), kind: "terrain", role: "dsm" },
        { file: file("b.tif"), kind: "terrain", role: "dtm" },
      ],
      slots: {},
    },
    opts
  );
  assert.deepEqual(
    calls.init.map((files) => files.map((f) => f.filename)),
    [["a.tif", "b.tif"], ["b.tif"]]
  );
});

test("a retry after the URL lapsed signs the slot again instead of resending the dead URL", async () => {
  const { api, calls, opts } = clockedApi({ putMinutes: 35, stalls: 1 });
  const run = { surveyId: "s1", files: [{ file: file("a.tif"), kind: "terrain", role: "dsm" }], slots: {} as Record<string, AssetSlot> };
  await assert.rejects(uploadFiles(api, run, opts), /upload stalled/);

  await uploadFiles(api, run, opts);
  assert.equal(calls.init.length, 2);
  assert.deepEqual(calls.put, ["https://signed/a.tif?X-Goog-Expires=1800&n=1", "https://signed/a.tif?X-Goog-Expires=1800&n=2"]);
  assert.deepEqual(calls.mark, ["asset-a.tif"]);
  assert.deepEqual(calls.remove, []);
  assert.equal(run.slots["a.tif"].marked, true);
});

test("a replacement signed again comes back as a new asset, and the pending one it leaves is retired", async () => {
  const { api, calls, opts } = clockedApi({ putMinutes: 35, stalls: 1 });
  const run = {
    surveyId: "s1",
    files: [{ file: file("dsm-v2.tif"), kind: "terrain", role: "dsm", replaces: "old-dsm" }],
    slots: {} as Record<string, AssetSlot>,
  };
  await assert.rejects(uploadFiles(api, run, opts), /upload stalled/);
  assert.equal(run.slots["dsm-v2.tif"].assetId, "asset-dsm-v2.tif-1");

  await uploadFiles(api, run, opts);
  assert.deepEqual(
    calls.init.map((files) => files.map((f) => f.replaces)),
    [["old-dsm"], ["old-dsm"]]
  );
  assert.deepEqual(calls.remove, ["asset-dsm-v2.tif-1"]);
  assert.deepEqual(calls.mark, ["asset-dsm-v2.tif-2"]);
  assert.equal(run.slots["dsm-v2.tif"].assetId, "asset-dsm-v2.tif-2");
  assert.equal(run.slots["dsm-v2.tif"].url, "gs://b/asset-dsm-v2.tif-2");
});

test("failing to retire the stale pending asset does not fail the upload", async () => {
  const { api, calls, opts } = clockedApi({ putMinutes: 35, stalls: 1 });
  api.removeAsset = async () => {
    throw new Error("http 409");
  };
  const run = {
    surveyId: "s1",
    files: [{ file: file("dsm-v2.tif"), kind: "terrain", role: "dsm", replaces: "old-dsm" }],
    slots: {} as Record<string, AssetSlot>,
  };
  await assert.rejects(uploadFiles(api, run, opts), /upload stalled/);
  await uploadFiles(api, run, opts);
  assert.deepEqual(calls.mark, ["asset-dsm-v2.tif-2"]);
});

test("an api that cannot retire assets never asks for a slot twice (a flight's init starts the flight)", async () => {
  const { api, calls, opts } = clockedApi({ putMinutes: 20 });
  const flight: UploadApi = { initUploads: api.initUploads, putToSignedUrl: api.putToSignedUrl, markAssetUploaded: api.markAssetUploaded };
  await assert.rejects(
    uploadFiles(
      flight,
      {
        surveyId: "s1",
        files: [
          { file: file("a.tif"), kind: "terrain", role: "dsm" },
          { file: file("b.tif"), kind: "terrain", role: "dtm" },
          { file: file("c.tif"), kind: "ortho", role: "ortho" },
        ],
        slots: {},
      },
      opts
    ),
    /ExpiredToken/
  );
  assert.equal(calls.init.length, 1);
});

test("a slot lasts as long as its URL's own X-Goog-Expires says", async () => {
  const { api } = fakeApi({
    initUploads: async () => ({
      uploads: [
        {
          asset: { id: "asset-a.tif", filename: "a.tif", url: "gs://b/a.tif" } as SourceAsset,
          upload_url: "https://storage.googleapis.com/b/a.tif?X-Goog-Date=20261023T000000Z&X-Goog-Expires=600&X-Goog-Signature=f00",
        },
      ],
    }),
  });
  const slots: Record<string, AssetSlot> = {};
  await uploadFiles(api, { surveyId: "s1", files: [{ file: file("a.tif"), kind: "terrain", role: "dsm" }], slots }, { now: () => 1000 });
  assert.equal(slots["a.tif"].expiresAt, 1000 + 10 * MINUTE);
});

test("a file the server returned no slot for fails the run", async () => {
  const { api } = fakeApi({ initUploads: async () => ({ uploads: [] }) });
  await assert.rejects(
    uploadFiles(api, { surveyId: "s1", files: [{ file: file("a.tif"), kind: "terrain", role: "dsm" }], slots: {} }),
    /No upload slot returned for a\.tif/
  );
});
