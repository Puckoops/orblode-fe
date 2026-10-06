import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DESIGN_COMPARE_FORMATS,
  buildDesignCompareRequest,
  designCompareEligible,
  designConformanceEntries,
  heatmapTileTemplate,
  isDesignConformanceEntry,
} from "../designCompare.ts";
import type { CutFillEntry, Manifest } from "../../api/orblodeSvc.ts";

test("buildDesignCompareRequest matches the design-compare v1 contract", () => {
  const req = buildDesignCompareRequest({
    surveySurfaceUrl: "https://storage.googleapis.com/b/dsm.tif",
    surveyCrs: "EPSG:32644",
    designUrl: "https://storage.googleapis.com/b/design.xml",
    designCrs: "EPSG:4326",
    designFormat: "landxml",
    surveyId: "sv-1",
    projectId: "pr-1",
  });

  assert.equal(req.processor_type, "design-compare");
  assert.equal(req.version, "v1");
  const p = req.payload as Record<string, unknown>;
  assert.deepEqual(p.survey_surface, {
    url: "https://storage.googleapis.com/b/dsm.tif",
    crs: "EPSG:32644",
  });
  assert.deepEqual(p.design_surface, {
    url: "https://storage.googleapis.com/b/design.xml",
    crs: "EPSG:4326",
    format: "landxml",
  });
  assert.equal(p.survey_id, "sv-1");
  assert.equal(p.project_id, "pr-1");
  assert.equal(p.survey_version, "v1");
});

test("buildDesignCompareRequest omits absent CRS keys but always keeps format", () => {
  const req = buildDesignCompareRequest({
    surveySurfaceUrl: "u1",
    designUrl: "u2",
    designFormat: "geotiff",
    surveyId: "s",
    projectId: "p",
  });
  const p = req.payload as Record<string, unknown>;
  const survey = p.survey_surface as Record<string, unknown>;
  const design = p.design_surface as Record<string, unknown>;
  assert.deepEqual(survey, { url: "u1" });
  assert.equal("crs" in survey, false);
  assert.deepEqual(design, { url: "u2", format: "geotiff" });
  assert.equal("crs" in design, false);
});

test("designCompareEligible accepts landxml + geotiff spellings, rejects others", () => {
  for (const ok of ["landxml", "LandXML", " GeoTIFF ", "tif", "TIFF"]) {
    assert.equal(designCompareEligible(ok), true, `${ok} should be eligible`);
  }
  for (const no of ["dxf", "obj", "geojson", "ifc", "", undefined]) {
    assert.equal(designCompareEligible(no), false, `${no} should be ineligible`);
  }
  // The advertised set is exactly the two contract formats.
  assert.deepEqual([...DESIGN_COMPARE_FORMATS], ["landxml", "geotiff"]);
});

const base = (over: Partial<CutFillEntry>): CutFillEntry => ({
  baseline_survey_id: "b",
  comparison_survey_id: "",
  scope: "site",
  zone_id: "",
  cut_volume_m3: 0,
  fill_volume_m3: 0,
  net_change_m3: 0,
  ...over,
});

test("isDesignConformanceEntry keys on the role field when present", () => {
  assert.equal(isDesignConformanceEntry(base({ role: "design_conformance" })), true);
  // A present-but-different role is some other analysis — rejected even though
  // the structural signature (site scope, empty comparison) would match.
  assert.equal(isDesignConformanceEntry(base({ role: "smart_base" })), false);
});

test("isDesignConformanceEntry falls back to structure only when role is absent", () => {
  // Legacy backend, no role: site scope + no comparison survey ⇒ conformance.
  assert.equal(isDesignConformanceEntry(base({})), true);
  // A real survey-vs-survey cut/fill (has a comparison survey) is never one.
  assert.equal(
    isDesignConformanceEntry(base({ comparison_survey_id: "sv-2", scope: "site" })),
    false
  );
  // A per-measurement (zone) scope with no role is not the site conformance.
  assert.equal(isDesignConformanceEntry(base({ scope: "zone" })), false);
});

test("designConformanceEntries filters the manifest analytics in order", () => {
  const manifest = {
    analytics: {
      stockpiles: null,
      cut_fill: [
        base({ comparison_survey_id: "sv-2", zone_id: "z1" }), // survey-vs-survey
        base({ role: "design_conformance", zone_id: "z2" }),
        base({ role: "design_conformance", zone_id: "z3" }),
      ],
    },
  } as unknown as Manifest;
  const out = designConformanceEntries(manifest);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => e.zone_id), ["z2", "z3"]);
  assert.deepEqual(designConformanceEntries(null), []);
});

test("heatmapTileTemplate uses an XYZ template verbatim", () => {
  const t = "/files/orblode/clients/c-1/heatmap/{z}/{x}/{y}.png";
  assert.equal(heatmapTileTemplate(t), t);
});

test("heatmapTileTemplate appends the gdal2tiles path to a bare directory", () => {
  assert.equal(
    heatmapTileTemplate("/files/orblode/clients/c-1/heatmap/"),
    "/files/orblode/clients/c-1/heatmap/{z}/{x}/{y}.png"
  );
  assert.equal(
    heatmapTileTemplate("/files/orblode/clients/c-1/heatmap"),
    "/files/orblode/clients/c-1/heatmap/{z}/{x}/{y}.png"
  );
});

test("heatmapTileTemplate returns null for a missing/blank URL", () => {
  assert.equal(heatmapTileTemplate(undefined), null);
  assert.equal(heatmapTileTemplate(null), null);
  assert.equal(heatmapTileTemplate("  "), null);
});
