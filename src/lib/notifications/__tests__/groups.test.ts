import { test } from "node:test";
import assert from "node:assert/strict";
import type { NotificationTypePreference } from "../../api/notifications.ts";
import { groupTypes } from "../groups.ts";

const type = (t: string): NotificationTypePreference => ({ type: t, tier: "p2", label: t, mutable: true, muted: false, pushable: false, push_muted: false });

test("groupTypes sections the types in a fixed order and drops empty sections", () => {
  const groups = groupTypes([type("site_summary"), type("survey_failed"), type("survey_processed"), type("design_ready")]);
  assert.deepEqual(
    groups.map((g) => [g.label, g.types.map((t) => t.type)]),
    [
      ["Processing", ["survey_processed", "survey_failed"]],
      ["Designs", ["design_ready"]],
      ["Sites", ["site_summary"]],
    ]
  );
});

test("groupTypes puts a type it doesn't know under Other", () => {
  assert.deepEqual(groupTypes([type("weekly_digest"), type("design_failed")]).map((g) => g.label), ["Designs", "Other"]);
});
