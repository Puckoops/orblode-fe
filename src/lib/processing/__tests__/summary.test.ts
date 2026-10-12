import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProcessingFailure, SurveyProcessing } from "../../api/orblodeSvc.ts";
import { failedInProject, failureLines, failureTitle, isStalled } from "../summary.ts";

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
