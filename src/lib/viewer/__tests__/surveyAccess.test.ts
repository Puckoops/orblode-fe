import { test } from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../../api/envelope.ts";
import { sitesHref, surveyDenial } from "../surveyAccess.ts";

const SITE = "6ac8e697-1b2c-4d3e-8f90-a1b2c3d4e5f6";

test("a draft refused for want of can_view_draft is unpublished, on the site the gate names", () => {
  const err = new ApiError(403, `forbidden: requires can_view_draft on project:${SITE}`);
  assert.deepEqual(surveyDenial(err), { reason: "unpublished", siteId: SITE });
});

test("an unpublished refusal without a site still reads as unpublished", () => {
  assert.deepEqual(surveyDenial(new ApiError(403, "forbidden: requires can_view_draft")), { reason: "unpublished", siteId: null });
});

test("any other 403 is no access, and never points at the site", () => {
  assert.deepEqual(surveyDenial(new ApiError(403, `forbidden: requires can_view_published on project:${SITE}`)), {
    reason: "no_access",
    siteId: null,
  });
  assert.deepEqual(surveyDenial(new ApiError(403, "")), { reason: "no_access", siteId: null });
});

test("only a 403 ApiError is a denial", () => {
  assert.equal(surveyDenial(new ApiError(404, "survey not found")), null);
  assert.equal(surveyDenial(new ApiError(500, "forbidden: requires can_view_draft")), null);
  assert.equal(surveyDenial(new Error("forbidden: requires can_view_draft")), null);
  assert.equal(surveyDenial(undefined), null);
});

test("sitesHref opens the named site, or the Sites page", () => {
  assert.equal(sitesHref(SITE), `/globe?site=${SITE}`);
  assert.equal(sitesHref(null), "/globe");
});
