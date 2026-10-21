import { test } from "node:test";
import assert from "node:assert/strict";
import type { NotificationTypePreference } from "../../api/notifications.ts";
import { groupTypes } from "../groups.ts";

const type = (t: string): NotificationTypePreference => ({
  type: t,
  tier: "p2",
  label: t,
  channels: { in_app: { on: true }, push: { on: false }, email: { on: false } },
});

test("groupTypes sections the types in a fixed order and drops empty sections", () => {
  const groups = groupTypes([type("site_summary"), type("survey_failed"), type("survey_processed"), type("design_ready")]);
  assert.deepEqual(
    groups.map((g) => [g.label, g.types.map((t) => t.type)]),
    [
      ["Processing", ["survey_processed", "survey_failed"]],
      ["Designs", ["design_ready"]],
      ["Projects", ["site_summary"]],
    ]
  );
});

test("groupTypes puts someone joining under People", () => {
  assert.deepEqual(groupTypes([type("member_joined"), type("site_summary")]).map((g) => [g.label, g.types.map((t) => t.type)]), [
    ["Projects", ["site_summary"]],
    ["People", ["member_joined"]],
  ]);
});

test("groupTypes puts a type it doesn't know under Other", () => {
  assert.deepEqual(groupTypes([type("weekly_digest"), type("design_failed")]).map((g) => g.label), ["Designs", "Other"]);
});

test("groupTypes puts a survey shared with someone under People", () => {
  assert.deepEqual(groupTypes([type("survey_shared"), type("member_joined")]).map((g) => [g.label, g.types.map((t) => t.type)]), [
    ["People", ["member_joined", "survey_shared"]],
  ]);
});

test("groupTypes puts the minor-minerals notices in their own section after People", () => {
  assert.deepEqual(groupTypes([type("mm_study_failed"), type("member_joined"), type("mm_study_ready")]).map((g) => [g.label, g.types.map((t) => t.type)]), [
    ["People", ["member_joined"]],
    ["Minor minerals", ["mm_study_ready", "mm_study_failed"]],
  ]);
});
