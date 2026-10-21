import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProjectOverview } from "../../api/orblodeSvc.ts";
import { attentionItems, freshnessOf, stockAsOf, surveyedWithin } from "../summary.ts";

const project = (id: string, change: Partial<ProjectOverview> = {}): ProjectOverview => ({
  project_id: id,
  surveys: 1,
  latest_survey: { id: `${id}-s`, date: "2026-10-01" },
  days_since_survey: 5,
  survey_gap: false,
  stock: null,
  next_depletion: null,
  ...change,
});

const stock = (date: string, change: Partial<NonNullable<ProjectOverview["stock"]>> = {}): ProjectOverview["stock"] => ({
  survey: { id: `s-${date}`, date },
  piles: 2,
  volume_m3: 100,
  tonnage_t: 150,
  value: 0,
  previous_survey: null,
  delta_volume_m3: null,
  delta_tonnage_t: null,
  stale: 0,
  failed: 0,
  uncomputed: 0,
  ...change,
});

test("projects surveyed recently leave out those without a survey or surveyed too long ago", () => {
  const projects = [project("a", { days_since_survey: 3 }), project("b", { days_since_survey: 30 }), project("c", { days_since_survey: 31 }), project("d", { days_since_survey: null })];
  assert.equal(surveyedWithin(projects, 30), 2);
});

test("attention lists failures and red reconciliations first, then stock running out, then survey gaps", () => {
  const items = attentionItems(
    {
      failed: [{ survey_id: "s1", project_id: "a", open: 0, failures: [{ label: "Terrain" }] as never }],
      alerts: [{ project_id: "b", from_survey_id: "x", to_survey_id: "y", red: [{ material_id: "m", name: "Gravel", variance_pct: 12 }], checked_at: 0 }],
      projects: [
        project("c", { survey_gap: true, days_since_survey: 45 }),
        project("d", { next_depletion: { material_id: "m", material: "Sand", date: "2026-12-01" } }),
      ],
    },
    "2026-10-21",
  );
  assert.deepEqual(
    items.map((i) => [i.tone, i.text, i.href]),
    [
      ["bad", "Terrain failed to process", "/projects?site=a"],
      ["bad", "Gravel reconciles red", "/reports?site=b&tab=reconciliation"],
      ["warn", "Sand runs out around 2026-12-01", "/reports?site=d&tab=trends"],
      ["info", "No survey for 45 days", "/projects?site=c"],
    ],
  );
});

test("stock running out more than 90 days away needs no attention yet", () => {
  const items = attentionItems({ failed: [], alerts: [], projects: [project("a", { next_depletion: { material_id: "m", material: "Sand", date: "2027-03-01" } })] }, "2026-10-21");
  assert.deepEqual(items, []);
});

test("stockpiles that failed to compute need action; edited or never computed ones need a compute", () => {
  const items = attentionItems(
    {
      failed: [],
      alerts: [],
      projects: [
        project("a", { stock: stock("2026-10-01", { failed: 2 }) }),
        project("b", { stock: stock("2026-10-01", { stale: 1 }) }),
        project("c", { stock: stock("2026-10-01", { stale: 1, uncomputed: 2 }) }),
      ],
    },
    "2026-10-21",
  );
  assert.deepEqual(
    items.map((i) => [i.tone, i.text, i.href]),
    [
      ["bad", "2 stockpiles failed to compute", "/reports?site=a&tab=inventory"],
      ["warn", "1 stockpile changed since computed", "/reports?site=b&tab=inventory"],
      ["warn", "3 stockpiles to compute", "/reports?site=c&tab=inventory"],
    ],
  );
});

test("freshness is recent to 30 days, due to 90 and dormant after", () => {
  assert.equal(freshnessOf(null), null);
  assert.equal(freshnessOf(0), "recent");
  assert.equal(freshnessOf(30), "recent");
  assert.equal(freshnessOf(31), "due");
  assert.equal(freshnessOf(90), "due");
  assert.equal(freshnessOf(91), "dormant");
});

test("stock has one as-of date only when every project's stock is from the same day", () => {
  assert.equal(stockAsOf([project("a", { stock: stock("2026-10-13") }), project("b")]), "2026-10-13");
  assert.equal(stockAsOf([project("a", { stock: stock("2026-10-13") }), project("b", { stock: stock("2026-09-01") })]), null);
  assert.equal(stockAsOf([project("a")]), null);
});
