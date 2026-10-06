import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProfile, userInitials } from "../profile.ts";

test("parseProfile keeps the login response's user, client and membership", () => {
  const raw = JSON.stringify({
    user: { id: "u1", email: "a@b.co", name: "Ada Lovelace" },
    client: { id: "c1", name: "Acme", company_name: "Acme Mining", email: "ops@acme.co", domain: "acme.co" },
    membership: { role: "admin", class: 2, is_superuser: false },
  });
  assert.deepEqual(parseProfile(raw), {
    user: { id: "u1", email: "a@b.co", name: "Ada Lovelace", client_id: "c1" },
    client: { id: "c1", name: "Acme", company_name: "Acme Mining", email: "ops@acme.co", domain: "acme.co" },
    membership: { role: "admin", class: 2, is_superuser: false },
  });
});

test("parseProfile rejects missing, malformed or id-less values", () => {
  for (const raw of [undefined, null, "", "{", "[]", JSON.stringify({ user: { id: "u1" } }), JSON.stringify({ user: { name: "x" }, client: { id: "c" } })]) {
    assert.equal(parseProfile(raw as string | undefined), null);
  }
});

test("parseProfile tolerates a login without a membership", () => {
  assert.equal(parseProfile(JSON.stringify({ user: { id: "u" }, client: { id: "c" } }))?.membership, null);
});

test("userInitials uses first and last name, else the email's first letter", () => {
  assert.equal(userInitials({ name: "ada byron lovelace", email: "" }), "AL");
  assert.equal(userInitials({ name: "Plato", email: "" }), "P");
  assert.equal(userInitials({ name: " ", email: "zed@x.io" }), "Z");
  assert.equal(userInitials(null), "");
});
