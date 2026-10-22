import { test } from "node:test";
import assert from "node:assert/strict";

import type { Measurement } from "@/lib/api/orblodeSvc";

import { inputsChangedAt, resultStateOf } from "../resultState.ts";

const m = (over: Partial<Measurement>): Measurement =>
  ({ id: "m", kind: "stockpile", status: "completed", created_at: 1, updated_at: 1, ...over }) as Measurement;

test("resultStateOf works the state out like orblode-svc when the server omits it", () => {
  assert.equal(resultStateOf(m({ kind: "distance", computed_at: 5 })), null);
  assert.equal(resultStateOf(m({ status: "draft" })), "missing");
  assert.equal(resultStateOf(m({ status: "computing", computed_at: 5 })), "computing");
  assert.equal(resultStateOf(m({ status: "failed", computed_at: 5 })), "failed");
  assert.equal(resultStateOf(m({ computed_at: 5, updated_at: 9, inputs_updated_at: 5 })), "fresh");
  assert.equal(resultStateOf(m({ computed_at: 5, updated_at: 9, inputs_updated_at: 6 })), "stale");
  assert.equal(resultStateOf(m({ computed_at: 5, updated_at: 9 })), "stale", "a row from before inputs_updated_at reads updated_at");
});

test("resultStateOf prefers the server's result_state", () => {
  assert.equal(resultStateOf(m({ computed_at: 5, updated_at: 9, result_state: "fresh" })), "fresh");
});

test("inputsChangedAt falls back to updated_at", () => {
  assert.equal(inputsChangedAt({ updated_at: 7 }), 7);
  assert.equal(inputsChangedAt({ updated_at: 7, inputs_updated_at: 3 }), 3);
});
