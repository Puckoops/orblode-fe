import { test } from "node:test";
import assert from "node:assert/strict";
import type { Workspace } from "../../api/userSvc.ts";
import { inSites, pickWorkspace, workspaceToFollow } from "../pick.ts";

const workspace = (id: string, is_default = false): Workspace => ({
  id,
  client_id: "c1",
  name: id,
  description: "",
  user_ids: [],
  is_default,
  project_count: 0,
  created_at: "",
  updated_at: "",
});

test("pickWorkspace keeps the remembered one only while it is still listed", () => {
  const list = [workspace("north"), workspace("acme", true), workspace("south")];
  assert.equal(pickWorkspace(list, "south"), "south");
  assert.equal(pickWorkspace(list, "gone"), "acme");
  assert.equal(pickWorkspace(list, null), "acme");
  assert.equal(pickWorkspace([workspace("north"), workspace("south")], null), "north");
  assert.equal(pickWorkspace([], "north"), "");
});

test("inSites keeps the workspace's items, and none before its sites load", () => {
  const items = [{ project_id: "p1" }, { project_id: "p2" }, { project_id: "p1" }];
  assert.deepEqual(inSites(items, [{ id: "p1" }]), [{ project_id: "p1" }, { project_id: "p1" }]);
  assert.deepEqual(inSites(items, null), []);
});

test("workspaceToFollow switches only to another workspace the person sees", () => {
  const list = [workspace("north"), workspace("south")];
  assert.equal(workspaceToFollow({ workspace_id: "south" }, list, "north"), "south");
  assert.equal(workspaceToFollow({ workspace_id: "north" }, list, "north"), null);
  assert.equal(workspaceToFollow({ workspace_id: "hidden" }, list, "north"), null);
  assert.equal(workspaceToFollow({ workspace_id: "" }, list, "north"), null);
  assert.equal(workspaceToFollow({ workspace_id: "south" }, null, "north"), null);
});
