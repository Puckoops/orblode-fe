import { strict as assert } from "node:assert";
import { test } from "node:test";
import { presence } from "../presence.ts";

test("presence steps from now through today, the week and the month to dormant", () => {
  const now = new Date(2026, 9, 14, 9, 30).getTime();
  assert.equal(presence(now - 9 * 60_000, now), "now");
  assert.equal(presence(now + 60_000, now), "now");
  assert.equal(presence(now - 10 * 60_000, now), "today");
  assert.equal(presence(new Date(2026, 9, 14, 0, 5).getTime(), now), "today");
  assert.equal(presence(new Date(2026, 9, 13, 23, 0).getTime(), now), "week");
  assert.equal(presence(new Date(2026, 9, 8, 12, 0).getTime(), now), "week");
  assert.equal(presence(new Date(2026, 9, 7, 12, 0).getTime(), now), "month");
  assert.equal(presence(new Date(2026, 8, 15, 12, 0).getTime(), now), "month");
  assert.equal(presence(new Date(2026, 8, 14, 12, 0).getTime(), now), "dormant");
});
