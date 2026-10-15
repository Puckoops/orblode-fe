import { test } from "node:test";
import assert from "node:assert/strict";

import { createViewerStore, isMeasurementVisibleOnCanvas } from "../state/store.ts";

test("toggleMeasurementVisible shows a measurement that has no visibility entry yet", () => {
  const store = createViewerStore("s1");
  store.getState().toggleMeasurementVisible("m1");
  assert.equal(isMeasurementVisibleOnCanvas({ id: "m1" }, store.getState().measurementVisibility), true);
  store.getState().toggleMeasurementVisible("m1");
  assert.equal(isMeasurementVisibleOnCanvas({ id: "m1" }, store.getState().measurementVisibility), false);
});

test("a flat 2D site shows the grid, and leaving 2D restores the saved choice", () => {
  const store = createViewerStore("s1");
  assert.equal(store.getState().viewMode, "3d");
  assert.equal(store.getState().gridVisible, false);

  store.getState().setViewMode("2d");
  assert.equal(store.getState().gridVisible, true);

  store.getState().setGridVisible(false);
  assert.equal(store.getState().gridVisible, false);
  store.getState().setViewMode("2d");
  assert.equal(store.getState().gridVisible, false);

  store.getState().setViewMode("3d");
  assert.equal(store.getState().gridVisible, false);
});

test("opening straight onto a flat site shows the grid unless a choice was supplied", () => {
  assert.equal(createViewerStore("s1", { viewMode: "2d" }).getState().gridVisible, true);
  assert.equal(createViewerStore("s1", { viewMode: "2d", gridVisible: false }).getState().gridVisible, false);
});

test("selectMeasurement asks for a fly unless told not to, and clearPendingFly drops it", () => {
  const store = createViewerStore("s1");
  store.getState().selectMeasurement("m1", { fly: true });
  assert.equal(store.getState().pendingFlyToId, "m1");
  store.getState().clearPendingFly();
  assert.equal(store.getState().pendingFlyToId, null);
  store.getState().selectMeasurement("m2", { fly: false });
  assert.equal(store.getState().pendingFlyToId, null);
});
