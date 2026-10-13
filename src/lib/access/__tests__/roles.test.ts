import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { AccessEntry, OrgMember, OrgViewer, Team } from "../../api/userSvc.ts";
import { canRemove, describeRoles, grantableSubjects, orgRoleChoices, parseSubjectKey, roleLabel, splitAccess, subjectKey } from "../roles.ts";

const viewer = (role: OrgViewer["role"]): OrgViewer => ({
  user_id: "me",
  role,
  can_manage_people: role !== "member",
  can_manage_owners: role === "owner",
  can_create_teams: true,
  can_create_workspaces: true,
});

const member = (user_id: string, role: OrgMember["role"]): OrgMember => ({ user_id, role, teams: [], is_verified: true, joined_at: "2026-10-01T00:00:00Z" });

test("roles read in the scope's order with their labels", () => {
  assert.equal(describeRoles(["reviewer", "survey_manager"], "workspace"), "Survey manager, Reviewer");
  assert.equal(describeRoles(["client_viewer"], "project"), "Viewer");
  assert.equal(roleLabel("site_owner"), "site owner");
});

test("only owners make or unmake owners", () => {
  assert.deepEqual(orgRoleChoices(viewer("owner"), "owner"), ["owner", "admin", "member"]);
  assert.deepEqual(orgRoleChoices(viewer("admin"), "member"), ["admin", "member"]);
  assert.deepEqual(orgRoleChoices(viewer("admin"), "owner"), []);
  assert.deepEqual(orgRoleChoices(viewer("member"), "member"), []);
  assert.deepEqual(orgRoleChoices(null, "member"), []);
});

test("anyone leaves, admins remove members and admins, and the last owner stays", () => {
  assert.equal(canRemove(viewer("member"), member("me", "member"), 1), true);
  assert.equal(canRemove(viewer("member"), member("ana", "member"), 1), false);
  assert.equal(canRemove(viewer("admin"), member("ana", "admin"), 1), true);
  assert.equal(canRemove(viewer("admin"), member("olive", "owner"), 2), false);
  assert.equal(canRemove(viewer("owner"), member("olive", "owner"), 2), true);
  assert.equal(canRemove(viewer("owner"), member("me", "owner"), 1), false);
});

const entry = (type: AccessEntry["subject"]["type"], id: string, source?: AccessEntry["source"]): AccessEntry => ({
  subject: { type, id, name: id },
  roles: ["reviewer"],
  source,
});

test("access splits into grants made here and those that reach it", () => {
  const north = { type: "workspace" as const, id: "w1", name: "North" };
  const { direct, inherited } = splitAccess([entry("user", "ana"), entry("team", "t1", north)]);
  assert.deepEqual(direct.map((e) => e.subject.id), ["ana"]);
  assert.deepEqual(inherited.map((e) => e.subject.id), ["t1"]);
});

test("only subjects without a grant here are offered, everyone only on a workspace", () => {
  const teams: Team[] = [{ id: "t1", name: "Surveyors", description: "", member_count: 3, can_manage: false, created_at: "", updated_at: "" }];
  const people = [{ ...member("ana", "member"), name: "Ana", email: "ana@example.com" }, member("raj", "member")];
  const granted = [entry("user", "ana"), entry("team", "t1", { type: "workspace", id: "w1", name: "North" })];
  const onWorkspace = grantableSubjects("workspace", { id: "acme", name: "Acme" }, teams, people, granted);
  assert.deepEqual(onWorkspace.map((o) => o.value), ["organisation:acme", "team:t1", "user:raj"]);
  assert.equal(onWorkspace[0].label, "Everyone in Acme");
  const onSite = grantableSubjects("project", { id: "acme", name: "Acme" }, teams, people, []);
  assert.deepEqual(onSite.map((o) => o.value), ["team:t1", "user:ana", "user:raj"]);
  assert.deepEqual(onSite[1].keywords, ["ana@example.com"]);
});

test("a subject key carries its type and an id that may hold colons", () => {
  assert.deepEqual(parseSubjectKey(subjectKey("team", "a:b")), { type: "team", id: "a:b" });
});
