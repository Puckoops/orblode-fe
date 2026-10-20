import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonOf } from "../season.ts";

test("January to May is before the monsoon", () => {
  assert.equal(seasonOf("2026-01-01"), "pre");
  assert.equal(seasonOf("2026-05-31"), "pre");
});

test("October to December is after the monsoon", () => {
  assert.equal(seasonOf("2026-10-01"), "post");
  assert.equal(seasonOf("2026-12-31"), "post");
});

test("the monsoon months and an unreadable date are left for the planner", () => {
  for (const date of ["2026-06-01", "2026-07-15", "2026-09-30", "", "soon"]) assert.equal(seasonOf(date), null);
});
