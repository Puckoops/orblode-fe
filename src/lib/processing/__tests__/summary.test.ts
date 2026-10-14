import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProcessingFailure, SurveyProcessing } from "../../api/orblodeSvc.ts";
import { failedInProject, failureLines, failureTitle, failuresByAsset, isStalled, notRetryableLines } from "../summary.ts";

const failure = (label: string, reason: string): ProcessingFailure => ({
  workflow_id: label,
  processor_type: "x",
  label,
  reason,
  completed_at: 1,
  retryable: true,
});

const survey = (open: number, failures: ProcessingFailure[], project_id = "p1"): SurveyProcessing => ({
  survey_id: "s1",
  project_id,
  open,
  failures,
});

test("isStalled only when nothing runs and something failed", () => {
  assert.equal(isStalled(survey(0, [failure("Orthophoto", "boom")])), true);
  assert.equal(isStalled(survey(1, [failure("Orthophoto", "boom")])), false);
  assert.equal(isStalled(survey(0, [])), false);
  assert.equal(isStalled(null), false);
});

test("failedInProject keeps one site's surveys", () => {
  const a = survey(0, [failure("A", "r")], "p1");
  const b = survey(0, [failure("B", "r")], "p2");
  assert.deepEqual(failedInProject([a, b], "p2"), [b]);
});

test("failure title and lines name the processor only when there are several", () => {
  const one = survey(0, [failure("Terrain (DSM)", "the DSM has no CRS")]);
  assert.equal(failureTitle(one), "Terrain (DSM) failed to process");
  assert.deepEqual(failureLines(one), ["the DSM has no CRS"]);
  const two = survey(0, [failure("Terrain (DSM)", "no CRS"), failure("Orthophoto", "timed out")]);
  assert.equal(failureTitle(two), "2 processors failed");
  assert.deepEqual(failureLines(two), ["Terrain (DSM): no CRS", "Orthophoto: timed out"]);
});

test("failuresByAsset marks every file a failed run read, and only the listed files of a partial run", () => {
  const assets = [
    { id: "dsm", url: "https://storage.googleapis.com/b/s/dsm.tif" },
    { id: "toe", url: "gs://b/s/toe.dxf" },
    { id: "ttm", url: "gs://b/s/Surface.ttm" },
  ];
  const processing = survey(0, [
    { ...failure("Terrain (DSM)", "the DSM has no CRS"), inputs: [{ asset_id: "dsm", name: "dsm.tif", source: "gs://b/s/dsm.tif" }] },
    {
      ...failure("Vectors", "Surface.ttm: unsupported"),
      partial: true,
      inputs: [
        { asset_id: "toe", name: "toe.dxf", source: "gs://b/s/toe.dxf" },
        { asset_id: "ttm", name: "Surface.ttm", source: "gs://b/s/Surface.ttm" },
      ],
      files: [{ source: "https://storage.googleapis.com/b/s/Surface.ttm", name: "Surface.ttm", reason: "unsupported" }],
    },
  ]);
  assert.deepEqual(
    [...failuresByAsset(processing, assets)],
    [
      ["dsm", ["Terrain (DSM) failed: the DSM has no CRS"]],
      ["ttm", ["Vectors couldn't read it: unsupported"]],
    ]
  );
});

test("failuresByAsset leaves out files the survey no longer has and runs that name none", () => {
  const replaced = survey(0, [
    { ...failure("Orthophoto", "boom"), inputs: [{ asset_id: "old", name: "o.tif", source: "gs://b/s/o.tif", changed: true }] },
    failure("Terrain (DTM)", "boom"),
  ]);
  assert.equal(failuresByAsset(replaced, [{ id: "new", url: "gs://b/s/o-v2.tif" }]).size, 0);
  assert.equal(failuresByAsset(null, [{ id: "new", url: "gs://b/s/o-v2.tif" }]).size, 0);
});

test("notRetryableLines says why each failure can't be retried as it was", () => {
  const changed = { ...failure("Terrain (DSM)", "no CRS"), retryable: false, inputs_changed: true };
  assert.deepEqual(notRetryableLines(survey(0, [changed])), ["A file it read has changed since; reprocess it in Edit survey → Files."]);
  const partial = { ...failure("Vectors", "x.ttm: unsupported"), retryable: false, partial: true };
  const old = { ...failure("Orthophoto", "boom"), retryable: false };
  assert.deepEqual(notRetryableLines(survey(0, [changed, partial, old, failure("Point cloud", "timed out")])), [
    "Terrain (DSM): a file it read has changed since; reprocess it in Edit survey → Files.",
    "Vectors: fix or replace the files it couldn't read, then reprocess them in Edit survey → Files.",
    "Orthophoto: upload its file again to process it.",
  ]);
});
