import assert from "node:assert/strict";
import { test } from "node:test";

import type { SourceAsset } from "@/lib/api/orblodeSvc";
import { assetFolders, isFolderKey, totalBytes } from "../folders.ts";

const asset = (id: string, over: Partial<SourceAsset> = {}): SourceAsset => ({
  id,
  client_id: "c1",
  survey_id: "s1",
  kind: "terrain",
  url: `gs://b/original/s1/${id}`,
  filename: id,
  status: "registered",
  ...over,
});

test("assetFolders groups by role in folder order, falling back to the ingest kind and then Other", () => {
  const folders = assetFolders([
    asset("cloud.laz", { kind: "pointcloud", role: "pointcloud" }),
    asset("notes.pdf", { kind: "document" }),
    asset("ortho.tif", { kind: "ortho" }),
    asset("dtm.tif", { role: "dtm" }),
    asset("surface.tif"),
    asset("dsm-2.tif", { role: "dsm" }),
  ]);
  assert.deepEqual(
    folders.map((f) => [f.key, f.label, f.assets.map((a) => a.id)]),
    [
      ["dsm", "DSM", ["surface.tif", "dsm-2.tif"]],
      ["dtm", "DTM", ["dtm.tif"]],
      ["ortho", "Orthophoto", ["ortho.tif"]],
      ["pointcloud", "Point cloud", ["cloud.laz"]],
      ["other", "Other", ["notes.pdf"]],
    ],
  );
});

test("assetFolders returns no folders for a survey without files", () => {
  assert.deepEqual(assetFolders([]), []);
});

test("isFolderKey accepts roles and other, nothing else", () => {
  assert.equal(isFolderKey("site_model"), true);
  assert.equal(isFolderKey("other"), true);
  assert.equal(isFolderKey("terrain"), false);
  assert.equal(isFolderKey("toString"), false);
  assert.equal(isFolderKey(null), false);
});

test("totalBytes ignores missing and non-positive sizes", () => {
  assert.equal(totalBytes([{ size_bytes: 1_000 }, {}, { size_bytes: -5 }, { size_bytes: 24 }]), 1_024);
});
