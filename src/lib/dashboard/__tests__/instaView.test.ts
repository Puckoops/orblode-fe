import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INSTA_VIEW_ACCEPT,
  INSTA_VIEW_MAX_BYTES,
  checkOverlayFile,
  framingBounds,
  jsonOverlayFormat,
  overlayLoadError,
  type Bounds,
} from "../instaView.ts";

const file = (name: string, size = 1024) => ({ name, size });

test("each supported extension, in any case, picks its loader", () => {
  assert.deepEqual(checkOverlayFile(file("site.kml")), { format: "kml" });
  assert.deepEqual(checkOverlayFile(file("Site Boundary.KMZ")), { format: "kml" });
  assert.deepEqual(checkOverlayFile(file("piles.geojson")), { format: "geojson" });
  assert.deepEqual(checkOverlayFile(file("piles.json")), { format: "geojson" });
  assert.deepEqual(checkOverlayFile(file("world.topojson")), { format: "geojson" });
  assert.deepEqual(checkOverlayFile(file("flight.czml")), { format: "czml" });
  assert.deepEqual(checkOverlayFile(file("haul-road.gpx")), { format: "gpx" });
});

test("the file picker offers exactly the extensions Insta View opens", () => {
  assert.equal(INSTA_VIEW_ACCEPT, ".kml,.kmz,.geojson,.json,.topojson,.czml,.gpx");
});

test("other files, files without an extension and dotfiles are refused by name", () => {
  for (const name of ["boundary.shp", "boundary", ".kml"]) {
    const out = checkOverlayFile(file(name));
    assert.ok("error" in out && out.error.startsWith(`${name} can't be opened.`), name);
  }
});

test("empty files and files over the size limit are refused", () => {
  assert.deepEqual(checkOverlayFile(file("site.kml", 0)), { error: "site.kml is empty." });
  assert.deepEqual(checkOverlayFile(file("site.kml", INSTA_VIEW_MAX_BYTES)), { format: "kml" });
  assert.deepEqual(checkOverlayFile(file("site.kml", INSTA_VIEW_MAX_BYTES + 1)), {
    error: "site.kml is over 50 MB, too big to open in the browser.",
  });
});

test("a .json array is CZML; a .geojson array stays GeoJSON so its loader reports the problem", () => {
  assert.equal(jsonOverlayFormat("flight.json", [{ id: "document", version: "1.0" }]), "czml");
  assert.equal(jsonOverlayFormat("piles.json", { type: "FeatureCollection", features: [] }), "geojson");
  assert.equal(jsonOverlayFormat("flight.czml", { id: "document" }), "czml");
  assert.equal(jsonOverlayFormat("piles.geojson", []), "geojson");
});

test("invalid JSON and projected GeoJSON get their own message", () => {
  assert.equal(overlayLoadError("piles.json", new SyntaxError("Unexpected token")), "piles.json isn't valid JSON.");
  assert.equal(
    overlayLoadError("piles.geojson", { message: "Unknown crs name: urn:ogc:def:crs:EPSG::32643" }),
    "piles.geojson is in EPSG:32643. Insta View draws GeoJSON in WGS 84 (EPSG:4326) only.",
  );
  assert.equal(
    overlayLoadError("piles.geojson", new Error("Unknown crs EPSG code: 7856")),
    "piles.geojson is in EPSG:7856. Insta View draws GeoJSON in WGS 84 (EPSG:4326) only.",
  );
});

const close = (actual: Bounds, expected: Bounds) => {
  for (const side of ["west", "south", "east", "north"] as const) {
    assert.ok(Math.abs(actual[side] - expected[side]) < 1e-9, `${side}: ${actual[side]} ≠ ${expected[side]}`);
  }
};

test("an overlay's bounds are framed with a tenth of their span to spare on each side", () => {
  close(framingBounds({ west: 152.9, south: -27.5, east: 153.1, north: -27.4 }), { west: 152.88, south: -27.51, east: 153.12, north: -27.39 });
});

test("a lone point or a straight line is widened to at least a hundredth of a degree", () => {
  close(framingBounds({ west: 153, south: -27.47, east: 153, north: -27.47 }), { west: 152.995, south: -27.475, east: 153.005, north: -27.465 });
  close(framingBounds({ west: 152.9, south: -27.47, east: 153.1, north: -27.47 }), { west: 152.88, south: -27.475, east: 153.12, north: -27.465 });
});

test("framing stops at the poles and the antimeridian, and leaves bounds across the antimeridian as they are", () => {
  close(framingBounds({ west: -180, south: -90, east: 180, north: 90 }), { west: -180, south: -90, east: 180, north: 90 });
  const across = { west: 179.9, south: -17, east: -179.9, north: -16.9 };
  assert.deepEqual(framingBounds(across), across);
});

test("any other failure gets a general message", () => {
  const general = "site.kmz couldn't be drawn. It may be damaged, or use features the globe can't show.";
  assert.equal(overlayLoadError("site.kmz", new Error("KMZ file does not contain a KML document.")), general);
  assert.equal(overlayLoadError("site.kmz", undefined), general);
  assert.equal(overlayLoadError("site.kmz", "boom"), general);
});
