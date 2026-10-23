import assert from "node:assert/strict";
import { test } from "node:test";

import type { InitiatedUpload, SourceAsset, UploadInitFile } from "@/lib/api/orblodeSvc";
import { uploadFiles, type AssetSlot, type UploadApi, type UploadFileStatus } from "../pipeline.ts";

const noSleep = async () => {};
const MINUTE = 60_000;
const atZero = { now: () => 0 };

function fakeApi(overrides: Partial<UploadApi> = {}) {
  const calls = { init: [] as UploadInitFile[][], resign: [] as [string, string][], put: [] as string[], mark: [] as string[] };
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
    resignUpload: async (_surveyId, assetId, contentType) => {
      calls.resign.push([assetId, contentType]);
      return { upload_url: `https://signed/${assetId}?again` };
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
  assert.deepEqual(calls.resign, []);
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
 * replacement's asset is named for the signing that made it, as orblode-svc keys a replacement by its new asset id. */
function clockedApi({ putMinutes, stalls = 0 }: { putMinutes: number; stalls?: number }) {
  const clock = { now: 0 };
  const signedAt = new Map<string, number>();
  let signings = 0;
  const sign = (assetId: string) => {
    const uploadUrl = `https://signed/${assetId}?X-Goog-Expires=1800&n=${++signings}`;
    signedAt.set(uploadUrl, clock.now);
    return uploadUrl;
  };
  const fake = fakeApi({
    initUploads: async (_surveyId, files) => {
      fake.calls.init.push(files);
      return {
        uploads: files.map((f): InitiatedUpload => {
          const id = f.replaces ? `asset-${f.filename}-${signings + 1}` : `asset-${f.filename}`;
          return { asset: { id, filename: f.filename, url: `gs://b/${id}` } as SourceAsset, upload_url: sign(id) };
        }),
      };
    },
    resignUpload: async (_surveyId, assetId, contentType) => {
      fake.calls.resign.push([assetId, contentType]);
      return { upload_url: sign(assetId) };
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

test("a long batch signs again a file whose URL would lapse before its turn, and never inits twice (a flight's init starts the flight)", async () => {
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
    [["a.tif", "b.tif", "c.tif"]]
  );
  assert.deepEqual(calls.resign, [["asset-c.tif", "image/tiff"]]);
  assert.deepEqual(calls.put, [
    "https://signed/asset-a.tif?X-Goog-Expires=1800&n=1",
    "https://signed/asset-b.tif?X-Goog-Expires=1800&n=2",
    "https://signed/asset-c.tif?X-Goog-Expires=1800&n=4",
  ]);
  assert.deepEqual(calls.mark, ["asset-a.tif", "asset-b.tif", "asset-c.tif"]);
});

test("a URL with under five minutes left is signed again too, not sent to lapse mid-request", async () => {
  const { api, calls, opts } = clockedApi({ putMinutes: 26 });
  await uploadFiles(
    api,
    {
      surveyId: "s1",
      files: [
        { file: file("a.tif"), kind: "terrain", role: "dsm" },
        { file: file("b.laz"), kind: "pointcloud", role: "pointcloud" },
      ],
      slots: {},
    },
    opts
  );
  assert.deepEqual(calls.resign, [["asset-b.laz", "application/octet-stream"]]);
});

test("a retry after the URL lapsed signs the slot again instead of resending the dead URL", async () => {
  const { api, calls, opts } = clockedApi({ putMinutes: 35, stalls: 1 });
  const run = { surveyId: "s1", files: [{ file: file("a.tif"), kind: "terrain", role: "dsm" }], slots: {} as Record<string, AssetSlot> };
  await assert.rejects(uploadFiles(api, run, opts), /upload stalled/);

  await uploadFiles(api, run, opts);
  assert.equal(calls.init.length, 1);
  assert.deepEqual(calls.put, ["https://signed/asset-a.tif?X-Goog-Expires=1800&n=1", "https://signed/asset-a.tif?X-Goog-Expires=1800&n=2"]);
  assert.deepEqual(calls.mark, ["asset-a.tif"]);
  assert.equal(run.slots["a.tif"].marked, true);
  assert.equal(run.slots["a.tif"].expiresAt, (35 + 30) * MINUTE);
});

test("a replacement signed again keeps its asset, so no pending row is left behind", async () => {
  const { api, calls, opts } = clockedApi({ putMinutes: 35, stalls: 1 });
  const run = {
    surveyId: "s1",
    files: [{ file: file("dsm-v2.tif"), kind: "terrain", role: "dsm", replaces: "old-dsm" }],
    slots: {} as Record<string, AssetSlot>,
  };
  await assert.rejects(uploadFiles(api, run, opts), /upload stalled/);
  await uploadFiles(api, run, opts);
  assert.equal(calls.init.length, 1);
  assert.deepEqual(calls.resign, [["asset-dsm-v2.tif-1", "image/tiff"]]);
  assert.deepEqual(calls.mark, ["asset-dsm-v2.tif-1"]);
  assert.equal(run.slots["dsm-v2.tif"].url, "gs://b/asset-dsm-v2.tif-1");
});

test("signing again is retried through a transient failure", async () => {
  const { api, calls, opts } = clockedApi({ putMinutes: 35, stalls: 1 });
  const resign = api.resignUpload;
  let attempts = 0;
  api.resignUpload = async (...args) => {
    if (++attempts < 2) throw Object.assign(new Error("http 503"), { status: 503 });
    return resign(...args);
  };
  const run = { surveyId: "s1", files: [{ file: file("a.tif"), kind: "terrain", role: "dsm" }], slots: {} as Record<string, AssetSlot> };
  await assert.rejects(uploadFiles(api, run, opts), /upload stalled/);
  await uploadFiles(api, run, { ...opts, retry: { sleep: noSleep } });
  assert.equal(attempts, 2);
  assert.deepEqual(calls.mark, ["asset-a.tif"]);
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
