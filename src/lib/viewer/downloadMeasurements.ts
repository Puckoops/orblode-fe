import { getProfile, type GeoJsonGeometry, type Measurement } from "@/lib/api/orblodeSvc";
import { geometryLocalStats } from "@/lib/viewer/measure";
import {
  EXPORT_MIME,
  exportItem,
  fileStem,
  measurementsCsv,
  measurementsDxf,
  measurementsGeoJson,
  measurementsKml,
  vertexHeights,
  type ExportFormat,
} from "@/lib/viewer/measurementExport";
import { getWorkingTransform } from "@/lib/viewer/projection";

const MAX_PROFILE_VERTICES = 500;

/** The survey surface's height at each vertex of each ring, sampled through the cross-section route; null where it has none. */
async function outlineHeights(surveyId: string, geometry: GeoJsonGeometry): Promise<(number | null)[][] | null> {
  const rings =
    geometry.type === "Polygon" ? (geometry.coordinates as number[][][]) : geometry.type === "LineString" ? [geometry.coordinates as number[][]] : [];
  if (rings.length === 0) return null;
  const out: (number | null)[][] = [];
  for (const ring of rings) {
    if (ring.length < 2 || ring.length > MAX_PROFILE_VERTICES) {
      out.push(ring.map(() => null));
      continue;
    }
    // A spacing longer than any outline puts stations on the vertices only.
    const res = await getProfile(surveyId, {
      line: { type: "LineString", coordinates: ring.map((p) => [p[0], p[1]]) },
      surfaces: [{ type: "survey_terrain", surface: "dsm" }],
      spacing_m: 1e7,
    });
    out.push(vertexHeights(res.vertices_m, res.distance_m, res.surfaces[0]?.z));
  }
  return out;
}

function save(name: string, text: string, format: ExportFormat) {
  const url = URL.createObjectURL(new Blob([text], { type: EXPORT_MIME[format] }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Downloads saved measurements of one survey in a format. One measurement is named after itself, several after the
 * survey. DXF needs the survey's working CRS; heights it can't sample leave that outline flat.
 */
export async function downloadMeasurements(
  measurements: Measurement[],
  format: ExportFormat,
  survey: { id: string; date: string; workingCrs?: string | null }
): Promise<void> {
  const items = measurements.map((m) => exportItem(m, m.geometry ? geometryLocalStats(m.geometry) : {}));
  const single = items.length === 1 ? items[0] : null;
  const stem = single ? `${fileStem(single.name)}-${survey.date}` : `measurements-${survey.date}`;
  const title = single ? `${single.name} · survey of ${survey.date}` : `Measurements · survey of ${survey.date}`;

  switch (format) {
    case "csv":
      save(`${stem}.csv`, measurementsCsv(items, survey.date), format);
      return;
    case "geojson":
      save(`${stem}.geojson`, measurementsGeoJson(items, survey.date), format);
      return;
    case "kml":
      save(`${stem}.kml`, measurementsKml(items, title, survey.date), format);
      return;
    case "dxf": {
      const transform = await getWorkingTransform(survey.workingCrs).catch(() => null);
      if (!transform) throw new Error("The survey's coordinate system couldn't be resolved, so there are no coordinates to write a DXF in.");
      const heights = new Map<string, (number | null)[][]>();
      for (const m of measurements) {
        if (!m.geometry) continue;
        const h = await outlineHeights(survey.id, m.geometry).catch(() => null);
        if (h) heights.set(m.id, h);
      }
      save(`${stem}.dxf`, measurementsDxf(items, (p) => transform.forward(p), heights), format);
      return;
    }
  }
}
