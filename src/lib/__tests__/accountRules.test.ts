import { test } from "node:test";
import assert from "node:assert/strict";
import { AVATAR_MAX_BYTES, avatarProblem, nameProblem, passwordProblems } from "../accountRules.ts";

test("avatarProblem takes PNG, JPEG and WebP up to 2 MB", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp"]) assert.equal(avatarProblem({ type, size: AVATAR_MAX_BYTES }), null);
  assert.match(avatarProblem({ type: "image/gif", size: 10 }) ?? "", /PNG, JPEG or WebP/);
  assert.match(avatarProblem({ type: "image/svg+xml", size: 10 }) ?? "", /PNG, JPEG or WebP/);
  assert.match(avatarProblem({ type: "image/png", size: AVATAR_MAX_BYTES + 1 }) ?? "", /2 MB/);
  assert.match(avatarProblem({ type: "image/png", size: 0 }) ?? "", /empty/);
});

test("nameProblem wants 1 to 100 characters once trimmed", () => {
  assert.equal(nameProblem(" Maya Rao "), null);
  assert.equal(nameProblem("x".repeat(100)), null);
  assert.equal(nameProblem("   "), "Enter your name.");
  assert.match(nameProblem("x".repeat(101)) ?? "", /100/);
});

test("passwordProblems asks for the current password, user-svc's rule and a matching confirmation", () => {
  assert.deepEqual(passwordProblems({ current: "Old-pass1", next: "New-pass1", confirm: "New-pass1" }), {});
  assert.deepEqual(Object.keys(passwordProblems({ current: "", next: "short", confirm: "" })).sort(), ["current", "next"]);
  assert.match(passwordProblems({ current: "Old-pass1", next: "Old-pass1", confirm: "Old-pass1" }).next ?? "", /aren't using now/);
  assert.equal(passwordProblems({ current: "Old-pass1", next: "New-pass1", confirm: "New-pass2" }).confirm, "The passwords don't match.");
});
