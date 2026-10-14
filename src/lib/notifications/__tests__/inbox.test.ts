import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppNotification } from "../../api/notifications.ts";
import {
  arrivedWhileAway,
  BURST_SIZE,
  dayGroup,
  groupNotices,
  INBOX_LIMIT,
  markNoticesRead,
  mergeNotices,
  noticeTime,
  noticeTone,
  toastsFor,
  toneFor,
} from "../inbox.ts";

const notice = (id: string, created_at: number, read_at = 0): AppNotification => ({
  id,
  client_id: "c1",
  recipient_id: "u1",
  type: "survey_failed",
  tier: "p1",
  title: `notice ${id}`,
  read_at,
  created_at,
});

test("mergeNotices replaces by id and keeps newest first", () => {
  const merged = mergeNotices([notice("a", 1), notice("b", 3)], [notice("c", 2), { ...notice("a", 1), title: "updated" }]);
  assert.deepEqual(merged.map((n) => n.id), ["b", "c", "a"]);
  assert.equal(merged.find((n) => n.id === "a")?.title, "updated");
});

test("mergeNotices keeps only the newest INBOX_LIMIT", () => {
  const many = Array.from({ length: INBOX_LIMIT + 5 }, (_, i) => notice(`n${i}`, i));
  const merged = mergeNotices([], many);
  assert.equal(merged.length, INBOX_LIMIT);
  assert.equal(merged[0].id, `n${INBOX_LIMIT + 4}`);
});

test("markNoticesRead marks only unread notices among the ids", () => {
  const out = markNoticesRead([notice("a", 1), notice("b", 2, 50), notice("c", 3)], ["a", "b"], 99);
  assert.deepEqual(out.map((n) => n.read_at), [99, 50, 0]);
});

test("markNoticesRead with all marks every unread notice", () => {
  const out = markNoticesRead([notice("a", 1), notice("b", 2, 50)], "all", 99);
  assert.deepEqual(out.map((n) => n.read_at), [99, 50]);
});

test("toneFor reads failures and red reconciliations as errors and finished work as success", () => {
  assert.equal(toneFor("survey_failed"), "error");
  assert.equal(toneFor("design_failed"), "error");
  assert.equal(toneFor("reconciliation_red"), "error");
  assert.equal(toneFor("survey_processed"), "success");
  assert.equal(toneFor("design_ready"), "success");
  assert.equal(toneFor("measurement_computed"), "success");
  assert.equal(toneFor("org_added"), "default");
  assert.equal(toneFor("site_summary"), "default");
});

test("noticeTime is as precise as its day group leaves room for", () => {
  const now = new Date(2026, 9, 14, 12, 0).getTime();
  assert.equal(noticeTime(now - 20_000, now), "Just now");
  assert.equal(noticeTime(now + 60_000, now), "Just now");
  assert.equal(noticeTime(now - 12 * 60_000, now), "12 min ago");
  assert.equal(noticeTime(now - 3 * 3_600_000, now), "3 h ago");
  assert.equal(noticeTime(new Date(2026, 9, 13, 15, 42).getTime(), now), "15:42");
  assert.equal(noticeTime(new Date(2026, 9, 12, 9, 5).getTime(), now), "Mon 09:05");
  assert.equal(noticeTime(new Date(2026, 8, 1, 10, 0).getTime(), now), "1 Sep");
  assert.equal(noticeTime(new Date(2025, 11, 31, 10, 0).getTime(), now), "31 Dec 2025");
});

test("dayGroup follows the calendar, not 24-hour spans", () => {
  const now = new Date(2026, 9, 14, 0, 30).getTime();
  assert.equal(dayGroup(new Date(2026, 9, 14, 0, 1).getTime(), now), "today");
  assert.equal(dayGroup(new Date(2026, 9, 13, 23, 50).getTime(), now), "yesterday");
  assert.equal(dayGroup(new Date(2026, 9, 8, 12, 0).getTime(), now), "week");
  assert.equal(dayGroup(new Date(2026, 9, 7, 12, 0).getTime(), now), "older");
});

test("groupNotices keeps the order and opens a heading per day group", () => {
  const now = new Date(2026, 9, 14, 12, 0).getTime();
  const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
  const groups = groupNotices([notice("a", at(14, 11)), notice("b", at(14, 9)), notice("c", at(13, 18)), notice("d", at(2, 9))], now);
  assert.deepEqual(
    groups.map((g) => [g.label, g.notices.map((n) => n.id)]),
    [
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["Older", ["d"]],
    ],
  );
  assert.deepEqual(groupNotices([], now), []);
});

test("noticeTone reads failures red, finished work teal and what needs a look amber", () => {
  assert.equal(noticeTone("survey_failed"), "red");
  assert.equal(noticeTone("reconciliation_red"), "red");
  assert.equal(noticeTone("design_ready"), "teal");
  assert.equal(noticeTone("stockpiles_computed"), "teal");
  assert.equal(noticeTone("uploads_unfinished"), "amber");
  assert.equal(noticeTone("stock_anomaly"), "amber");
  assert.equal(noticeTone("member_joined"), "neutral");
  assert.equal(noticeTone("added_to_organisation"), "neutral");
});

test("toastsFor gives each notice its own toast until a burst", () => {
  const ready = { ...notice("a", 1), type: "design_ready", tier: "p2" as const, body: "Compare it", link: "/viewer/s1" };
  assert.deepEqual(toastsFor([ready, notice("b", 2)]), [
    { title: "notice a", body: "Compare it", link: "/viewer/s1", tone: "success", id: "a" },
    { title: "notice b", body: undefined, link: undefined, tone: "error", id: "b" },
  ]);
  assert.deepEqual(toastsFor([]), []);
});

test("toastsFor folds a burst into one toast led by a notice someone acts on", () => {
  const p2 = (id: string) => ({ ...notice(id, 1), type: "site_summary", tier: "p2" as const });
  const burst = [p2("a"), notice("b", 2), p2("c")];
  assert.equal(burst.length, BURST_SIZE);
  assert.deepEqual(toastsFor(burst), [{ title: "3 new notifications", body: "notice b, and 2 more.", tone: "error" }]);
  assert.deepEqual(toastsFor([p2("a"), p2("b"), p2("c"), p2("d")]), [{ title: "4 new notifications", body: "notice d, and 3 more.", tone: "default" }]);
});

test("arrivedWhileAway is the unread notices the reload found that the inbox didn't have, oldest first", () => {
  const before = [notice("a", 1), notice("b", 2)];
  const after = [notice("d", 4), notice("c", 3), notice("e", 5, 9), notice("b", 2)];
  assert.deepEqual(arrivedWhileAway(before, after).map((n) => n.id), ["c", "d"]);
  assert.deepEqual(arrivedWhileAway(after, after), []);
});
