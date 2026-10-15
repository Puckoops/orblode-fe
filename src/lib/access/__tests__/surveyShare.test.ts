import { test } from "node:test";
import assert from "node:assert/strict";

import type { SurveyShare } from "../../api/orblodeSvc.ts";
import type { AccessEntry, OrgMember, Team } from "../../api/userSvc.ts";
import {
  inviteSuggestions,
  ownAccess,
  resolveInvitees,
  shareLink,
  shareOptions,
  shareRows,
  sharedWithEveryone,
  siteAccessDetail,
  siteAccessSummary,
} from "../surveyShare.ts";

const person = (user_id: string, name?: string, email?: string) =>
  ({ user_id, name, email, role: "member", teams: [], is_verified: true, joined_at: "" }) as OrgMember;
const team = (id: string, name: string, member_count: number) =>
  ({ id, name, description: "", member_count, can_manage: false, created_at: "", updated_at: "" }) as Team;
const share = (type: SurveyShare["subject"]["type"], id: string): SurveyShare => ({ subject: { type, id }, role: "viewer" });

const people = [person("u1", "Ana Silva ", "ana@acme.test"), person("u2", undefined, "raj@acme.test"), person("u3", "Zoe", "zoe@acme.test")];
const teams = [team("t1", "Surveyors", 4), team("t2", "Pit crew", 1)];

test("rows name teams first, then people, alphabetically, leaving out the whole organisation", () => {
  const rows = shareRows([share("user", "u3"), share("organisation", "c1"), share("user", "u1"), share("team", "t1")], people, teams);
  assert.deepEqual(
    rows.map((r) => [r.key, r.name, r.meta]),
    [
      ["team:t1", "Surveyors", "Team · 4 people"],
      ["user:u1", "Ana Silva", "ana@acme.test"],
      ["user:u3", "Zoe", "zoe@acme.test"],
    ]
  );
});

test("someone without a name shows their email, and grantees the organisation no longer has still show", () => {
  const rows = shareRows([share("user", "u2"), share("user", "gone"), share("team", "gone")], people, teams);
  assert.deepEqual(
    rows.map((r) => [r.name, r.meta]),
    [
      ["A team that was deleted", undefined],
      ["raj@acme.test", undefined],
      ["Someone no longer in the organisation", undefined],
    ]
  );
});

test("options leave out whoever it is shared with already", () => {
  const options = shareOptions([share("team", "t1"), share("user", "u1")], people, teams);
  assert.deepEqual(
    options.map((o) => o.value),
    ["team:t2", "user:u2", "user:u3"]
  );
  assert.equal(options[0].meta, "Team · 1 person");
  assert.deepEqual(options.find((o) => o.value === "user:u2")?.keywords, ["raj@acme.test"]);
});

test("general access is everyone in the organisation when it holds a share", () => {
  assert.equal(sharedWithEveryone([share("user", "u1")]), false);
  assert.equal(sharedWithEveryone([share("organisation", "c1")]), true);
});

test("the link opens the survey's viewer in its organisation", () => {
  assert.equal(shareLink("https://app.orblode.test", "6ac8e697e4b0a1b2c3d4e5f6", "c1"), "https://app.orblode.test/viewer/6ac8e697e4b0a1b2c3d4e5f6?org=c1");
  assert.equal(shareLink("http://localhost:3100", "s1", null), "http://localhost:3100/viewer/s1");
});

test("an invite box reads names, emails and team names separated by commas, ignoring case", () => {
  const options = shareOptions([], people, teams);
  const { found, already, unknown } = resolveInvitees(" ana@ACME.test, surveyors ,zoe, nobody@else.test,, Zoe", options);
  assert.deepEqual(
    found.map((o) => o.value),
    ["user:u1", "team:t1", "user:u3"]
  );
  assert.deepEqual(already, []);
  assert.deepEqual(unknown, ["nobody@else.test"]);
});

test("someone the survey is already shared with is told apart from someone who isn't in the organisation", () => {
  const options = shareOptions([], people, teams);
  const { found, already, unknown } = resolveInvitees("ana@acme.test, zoe", options, new Set(["user:u1"]));
  assert.deepEqual(
    already.map((o) => o.label),
    ["Ana Silva"]
  );
  assert.deepEqual(
    found.map((o) => o.label),
    ["Zoe"]
  );
  assert.deepEqual(unknown, []);
});

test("suggestions match what is typed after the last comma, word starts first", () => {
  const options = shareOptions([], people, teams);
  assert.deepEqual(
    inviteSuggestions("ana@acme.test, s", options, []).map((o) => o.label),
    ["Surveyors", "Ana Silva"]
  );
  assert.deepEqual(
    inviteSuggestions("lva", options, []).map((o) => o.label),
    ["Ana Silva"]
  );
  assert.deepEqual(
    inviteSuggestions("raj", options, []).map((o) => o.value),
    ["user:u2"]
  );
  assert.deepEqual(inviteSuggestions("z", options, ["user:u3"]), []);
  assert.deepEqual(inviteSuggestions("ana, ", options, []), []);
});

test("your own access follows your permissions on the site", () => {
  assert.equal(ownAccess({ can_manage_users: true, can_create_measurement: true }), "Full access");
  assert.equal(ownAccess({ can_create_measurement: true }), "Can edit");
  assert.equal(ownAccess({ can_view_published: true }), "Can view");
  assert.equal(ownAccess(undefined), "Can view");
});

test("the site's roles read as one role, or mixed access, with who holds them", () => {
  const entry = (type: AccessEntry["subject"]["type"], id: string, roles: string[], source?: AccessEntry["source"]): AccessEntry => ({ subject: { type, id, name: id }, roles, source });
  const pms = [entry("user", "a", ["project_manager"]), entry("user", "b", ["project_manager"])];
  assert.deepEqual(siteAccessSummary(pms), { everyone: false, people: 2, teams: 0, access: "Project manager" });
  const mixed = siteAccessSummary([
    ...pms,
    entry("user", "a", ["project_manager"], { type: "organisation", id: "c1", name: "Acme" }),
    entry("organisation", "c1", ["client_viewer"], { type: "workspace", id: "w1", name: "Home" }),
    entry("team", "t1", ["survey_manager"]),
  ]);
  assert.deepEqual(mixed, { everyone: true, people: 2, teams: 1, access: "Mixed access" });
  assert.equal(siteAccessDetail(mixed, "Acme"), "Site · everyone at Acme · 2 people · 1 team");
  assert.equal(siteAccessDetail({ everyone: false, people: 1, teams: 0 }, "Acme"), "Site · 1 person");
});
