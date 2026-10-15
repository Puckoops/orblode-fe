import { test } from "node:test";
import assert from "node:assert/strict";
import { organisationForClient, organisationLabel, orgLink, unopened, withoutOrg, type OrganisationChoice } from "../links.ts";

const own: OrganisationChoice = { id: "own", name: "Own", current: true, joined: true };
const added: OrganisationChoice = { id: "added", name: "acme", company_name: "Acme Mining", current: false, joined: false };
const opened: OrganisationChoice = { id: "opened", name: "Opened", current: false, joined: true };

test("orgLink leaves a link with no org alone", () => {
  assert.deepEqual(orgLink(null, [own, added]), { kind: "none" });
  assert.deepEqual(orgLink("", [own, added]), { kind: "none" });
});

test("orgLink switches to another of their organisations and stays in the open one", () => {
  assert.deepEqual(orgLink("added", [own, added]), { kind: "switch", id: "added" });
  assert.deepEqual(orgLink("own", [own, added]), { kind: "here" });
});

test("orgLink says when they're not in the organisation", () => {
  assert.deepEqual(orgLink("elsewhere", [own, added]), { kind: "unknown" });
});

test("withoutOrg drops only the org parameter", () => {
  assert.equal(withoutOrg("https://www.orblode.com/globe?org=added"), "/globe");
  assert.equal(withoutOrg("/settings?tab=people&org=added#x"), "/settings?tab=people#x");
  assert.equal(withoutOrg("/globe"), "/globe");
});

test("unopened points out organisations not yet opened, once", () => {
  assert.deepEqual(unopened([own, added, opened], []).map((o) => o.id), ["added"]);
  assert.deepEqual(unopened([own, added, opened], ["added"]), []);
});

test("organisationLabel prefers the company name", () => {
  assert.equal(organisationLabel(added), "Acme Mining");
  assert.equal(organisationLabel(own), "Own");
});

test("organisationForClient names the organisation a workspace belongs to", () => {
  assert.equal(organisationForClient("added", [own, added], own), "Acme Mining");
  assert.equal(organisationForClient("own", null, own), "Own");
  assert.equal(organisationForClient("elsewhere", [own, added], own), "");
});
