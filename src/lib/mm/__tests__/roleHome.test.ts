import { test } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceAccessSummary } from "../../api/userSvc.ts";
import { MODE_HOME, modeOf } from "../roleHome.ts";

const none: WorkspaceAccessSummary = {
  can_manage: false,
  can_upload_any: false,
  can_run_analysis_any: false,
  can_plan_mission_any: false,
  can_upload_mission_data_any: false,
  can_vet_any: false,
};

test("someone who can only vet is an official and lands on Reports", () => {
  assert.equal(modeOf({ ...none, can_vet_any: true }), "official");
  assert.equal(MODE_HOME.official, "/reports");
});

test("someone who can only upload mission data is a vendor and lands on their missions", () => {
  assert.equal(
    modeOf({ ...none, can_upload_mission_data_any: true }),
    "vendor",
  );
  assert.equal(
    modeOf({ ...none, can_upload_mission_data_any: true, can_vet_any: true }),
    "vendor",
  );
});

test("anyone who can plan, upload, run studies or manage is a planner, whatever else they hold", () => {
  for (const key of [
    "can_manage",
    "can_upload_any",
    "can_run_analysis_any",
    "can_plan_mission_any",
  ] as const) {
    assert.equal(
      modeOf({
        ...none,
        [key]: true,
        can_vet_any: true,
        can_upload_mission_data_any: true,
      }),
      "planner",
      key,
    );
  }
});

test("a viewer, or a user-svc that doesn't send the summary, leaves the planner's rail", () => {
  assert.equal(modeOf(none), "planner");
  assert.equal(modeOf(undefined), "planner");
  assert.equal(modeOf(null), "planner");
});
