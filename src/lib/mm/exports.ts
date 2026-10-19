import type { GCP, GeoJSONGeometry, LonLat, Mission, MissionGeometry } from "../api/mm.ts";
import { toUtm } from "./utm.ts";
import { zip } from "./zip.ts";

// A mission's field files: the flight plan as KML (Google Earth, QGIS and most flight apps read it), its
// waypoints as a Litchi CSV, the GCP layout with the trace of every move, and the pre-flight checklist.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const coord = (p: LonLat, h = 0) => `${p.lon.toFixed(8)},${p.lat.toFixed(8)},${h}`;

function rings(g: GeoJSONGeometry): [number, number][][] {
  if (g.type === "Polygon") return [(g.coordinates as [number, number][][])[0]];
  if (g.type === "MultiPolygon") return (g.coordinates as [number, number][][][]).map((p) => p[0]);
  return [];
}

function polygonPlacemark(name: string, style: string, g: GeoJSONGeometry): string {
  return rings(g)
    .map(
      (r) => `    <Placemark><name>${esc(name)}</name><styleUrl>#${style}</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>${r
        .map(([x, y]) => `${x.toFixed(8)},${y.toFixed(8)},0`)
        .join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`
    )
    .join("\n");
}

export function flightPlanKml(m: Mission, g: MissionGeometry, leaseName: string): string {
  const h = m.settings.altitude_m;
  const route = g.lines.flatMap(([a, b]) => [coord(a, h), coord(b, h)]).join(" ");
  const gcps = m.gcps
    .map((p) => `    <Placemark><name>${esc(p.id)}</name><description>${esc(`${p.role} · ${p.where}${p.moved_m >= 0.5 ? ` · moved ${p.moved_m.toFixed(1)} m ${p.bearing ?? ""}` : ""}`)}</description><styleUrl>#${p.role === "gcp" ? "gcp" : "check"}</styleUrl><Point><coordinates>${coord(p.final)}</coordinates></Point></Placemark>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(`${m.code} · ${leaseName}`)}</name>
    <description>${esc(`${m.stats.lines} lines at ${h} m above ground, ${m.settings.front_overlap}/${m.settings.side_overlap} % overlap, GSD ${m.stats.gsd_cm} cm`)}</description>
    <Style id="lease"><LineStyle><color>ff3a9ff2</color><width>3</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>
    <Style id="buffer"><LineStyle><color>ffa8917f</color><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>
    <Style id="safety"><LineStyle><color>ff7b84f2</color><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>
    <Style id="route"><LineStyle><color>ffe6a35a</color><width>2</width></LineStyle></Style>
    <Style id="gcp"><IconStyle><color>ff3a9ff2</color></IconStyle></Style>
    <Style id="check"><IconStyle><color>ffffffff</color></IconStyle></Style>
${polygonPlacemark("Lease boundary", "lease", g.lease)}
${polygonPlacemark(`Survey buffer ${m.settings.buffer_m} m`, "buffer", g.buffer)}
${polygonPlacemark(`Safety zone (geofence) ${m.settings.buffer_m + m.settings.safety_zone_m} m`, "safety", g.safety)}
    <Placemark><name>Flight route</name><styleUrl>#route</styleUrl><LineString><altitudeMode>relativeToGround</altitudeMode><coordinates>${route}</coordinates></LineString></Placemark>
${gcps}
  </Document>
</kml>
`;
}

const LITCHI_HEADER =
  "latitude,longitude,altitude(m),heading(deg),curvesize(m),rotationdir,gimbalmode,gimbalpitchangle,actiontype1,actionparam1,altitudemode,speed(m/s),poi_latitude,poi_longitude,poi_altitude(m),poi_altitudemode,photo_timeinterval,photo_distinterval";

function bearing(a: LonLat, b: LonLat): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Litchi's waypoint mission: each line's two ends, camera straight down, a photo every trigger distance. */
export function litchiCsv(m: Mission, g: MissionGeometry): string {
  const rows = [LITCHI_HEADER];
  for (const [a, b] of g.lines) {
    const heading = Math.round(bearing(a, b));
    for (const p of [a, b]) {
      rows.push(
        [p.lat.toFixed(8), p.lon.toFixed(8), m.settings.altitude_m, heading, 0, 0, 2, -90, -1, 0, 1, m.settings.speed_ms, 0, 0, 0, 0, -1, m.stats.trigger_m.toFixed(1)].join(",")
      );
    }
  }
  return rows.join("\n") + "\n";
}

/** The GCP layout with both positions of every point, in WGS 84 and its UTM zone. */
export function gcpCsv(gcps: GCP[]): string {
  const rows = ["point,role,placement,auto_lat,auto_lon,final_lat,final_lon,final_easting,final_northing,utm_zone,moved_m,direction,reason,approval"];
  for (const p of gcps) {
    const u = toUtm(p.final.lon, p.final.lat);
    rows.push(
      [
        p.id,
        p.role,
        `"${p.where}"`,
        p.auto.lat.toFixed(8),
        p.auto.lon.toFixed(8),
        p.final.lat.toFixed(8),
        p.final.lon.toFixed(8),
        u.easting.toFixed(3),
        u.northing.toFixed(3),
        `${u.zone}${u.north ? "N" : "S"}`,
        p.moved_m.toFixed(1),
        p.bearing ?? "",
        `"${(p.reason ?? "").replace(/"/g, "'")}"`,
        p.approval ?? "",
      ].join(",")
    );
  }
  return rows.join("\n") + "\n";
}

export function preflightChecklist(m: Mission, leaseName: string, vendor: string, drone: string): string {
  const lines = [
    `PRE-FLIGHT CHECKLIST · ${m.code}`,
    `${leaseName} · ${m.season === "post" ? "post-monsoon" : "pre-monsoon"} · window ${m.window || m.flight_from || "to be set"}`,
    `Vendor ${vendor || "–"} · drone ${drone || "–"}`,
    "",
    `[ ] Altitude ${m.settings.altitude_m} m AGL, ${m.settings.front_overlap}/${m.settings.side_overlap} % overlap, ${m.settings.speed_ms} m/s`,
    `[ ] Geofence set ${m.settings.buffer_m + m.settings.safety_zone_m} m outside the lease`,
    `[ ] ${m.stats.batteries} battery set(s) charged; safe landing point marked`,
    `[ ] Targets laid at every issued GCP position (${m.gcps.length} points)`,
    "[ ] Each target observed with DGPS for 15 minutes or more; base for 2 hours or more",
    "[ ] A target set more than 5 m from its issued position: note why on the field sheet",
    "[ ] More than 20 m: call the planner before flying",
    "[ ] Antenna heights and models written down for every session",
    "[ ] Mark photos taken of each target",
    "",
    "Checks at issue:",
    ...m.checks.map((c) => `  ${c.state === "ok" ? "OK  " : c.state === "warn" ? "WARN" : "FAIL"} ${c.label}: ${c.detail}`),
    "",
  ];
  return lines.join("\n");
}

/** The whole mission pack as one ZIP. */
export function missionPack(m: Mission, g: MissionGeometry, leaseName: string, vendor: string, drone: string): Uint8Array {
  return zip([
    { name: `${m.code}_flight_plan.kml`, data: flightPlanKml(m, g, leaseName) },
    { name: `${m.code}_waypoints_litchi.csv`, data: litchiCsv(m, g) },
    { name: `${m.code}_gcp_layout.csv`, data: gcpCsv(m.gcps) },
    { name: `${m.code}_preflight_checklist.txt`, data: preflightChecklist(m, leaseName, vendor, drone) },
  ]);
}

/** Saves text or bytes as a file in the browser. */
export function saveFile(name: string, data: string | Uint8Array, type: string) {
  const blob = new Blob([typeof data === "string" ? data : new Uint8Array(data)], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
