import { test } from "node:test";
import assert from "node:assert/strict";

import type { SurveyShare } from "../../api/orblodeSvc.ts";
import type { OrgMember, Team } from "../../api/userSvc.ts";
import { shareLink, shareOptions, shareRows, sharedWithEveryone } from "../surveyShare.ts";

const person = (user_id: string, name?: string, email?: string) =>
  ({ user_id, name, email, role: "member", teams: [], is_verified: true, joined_at: "" }) as OrgMember;
const team = (id: string, name: string, member_count: number) =>
  ({ id, name, description: "", member_count, can_manage: false, created_at: "", updated_at: "" }) as Team;
const share = (type: SurveyShare["subject"]["type"], id: string): SurveyShare => ({ subject: { type, id }, role: "viewer" });

const people = [person("u1", "Ana Silva", "ana@acme.test"), person("u2", undefined, "raj@acme.test"), person("u3", "Zoe", "zoe@acme.test")];
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
