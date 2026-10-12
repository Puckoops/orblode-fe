import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationServerKey, sameKey, shouldOffer } from "../keys.ts";

test("applicationServerKey decodes base64url with or without padding", () => {
  assert.deepEqual([...applicationServerKey("BOr_-w")], [0x04, 0xea, 0xff, 0xfb]);
  assert.deepEqual([...applicationServerKey("BOr_-w==")], [0x04, 0xea, 0xff, 0xfb]);
});

test("sameKey compares the subscription's key byte for byte", () => {
  const key = applicationServerKey("BOr_-w");
  assert.equal(sameKey(new Uint8Array([4, 0xea, 0xff, 0xfb]).buffer, key), true);
  assert.equal(sameKey(new Uint8Array([4, 0xea, 0xff, 0xfa]).buffer, key), false);
  assert.equal(sameKey(new Uint8Array([4, 0xea]).buffer, key), false);
  assert.equal(sameKey(null, key), false);
});

test("shouldOffer asks once, and only while the browser hasn't been asked", () => {
  assert.equal(shouldOffer(true, "default", null), true);
  assert.equal(shouldOffer(true, "default", "dismissed"), false);
  assert.equal(shouldOffer(true, "granted", null), false);
  assert.equal(shouldOffer(true, "denied", null), false);
  assert.equal(shouldOffer(false, "default", null), false);
});
