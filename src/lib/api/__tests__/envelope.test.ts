import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, readBody } from "../envelope.ts";

const envelope = (body: object) => JSON.stringify(body);

test("a successful envelope yields its data", () => {
  assert.deepEqual(readBody(200, true, envelope({ status: 200, error: false, data: { id: "p-1" } })), { id: "p-1" });
});

test("an envelope flagged as an error throws its message with the HTTP status", () => {
  assert.throws(
    () => readBody(409, false, envelope({ status: 409, error: true, message: "compute already running" })),
    (err: unknown) => err instanceof ApiError && err.status === 409 && err.message === "compute already running",
  );
});

test("error:true wins even on a 200", () => {
  assert.throws(() => readBody(200, true, envelope({ status: 400, error: true, message: "bad" })), /bad/);
});

test("a failed envelope without a message still says what failed", () => {
  assert.throws(() => readBody(500, false, envelope({ status: 500, error: true })), /Request failed \(500\)/);
});

test("a bare JSON body passes through when the response is ok", () => {
  assert.deepEqual(readBody(200, true, JSON.stringify([1, 2])), [1, 2]);
});

test("a non-envelope error body surfaces its error string first, then message", () => {
  assert.throws(() => readBody(502, false, JSON.stringify({ error: "upstream down" })), /upstream down/);
  assert.throws(() => readBody(404, false, JSON.stringify({ message: "not here" })), /not here/);
});

test("an empty or non-JSON body is null when ok and a status error otherwise", () => {
  assert.equal(readBody(200, true, ""), null);
  assert.throws(() => readBody(504, false, "<html>Gateway Timeout</html>"), /Request failed \(504\)/);
});
