// The pipeline an upload will run, drawn as nodes and edges beside the stepper: what the person uploads, what
// Orblode runs on it, and what reaches the viewer. Pure, so the layout and every state are tested without a browser.

/** up: still to upload or uploading; done: uploaded; made: Orblode runs it; ready: what the viewer gets; skip: not
 * in this pipeline; site: already on the site or lease; warn: missing something the result needs. */
export type NodeStyle = "up" | "done" | "made" | "ready" | "skip" | "site" | "warn";

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  style: NodeStyle;
}

/** A polyline; an arrow ends in a head at its last point. Off edges are dashed. */
export interface GraphEdge {
  id: string;
  points: [number, number][];
  arrow: boolean;
  on: boolean;
}

export interface GraphHeader {
  x: number;
  y: number;
  w: number;
  text: string;
}

export interface Graph {
  width: number;
  height: number;
  headers: GraphHeader[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** A dashed group of what this pipeline leaves out. */
  group?: { x: number; y: number; w: number; h: number; label: string };
}

/** An input's upload, as the graph shows it. */
export type Upload = { state: "none" } | { state: "uploading"; percent: number } | { state: "done"; label: string };

export const NOT_UPLOADED: Upload = { state: "none" };

const inputNode = (id: string, x: number, y: number, w: number, h: number, title: string, on: boolean, upload: Upload, offSub: string): GraphNode => {
  if (!on) return { id, x, y, w, h, title, sub: offSub, style: "skip" };
  if (upload.state === "uploading") return { id, x, y, w, h, title, sub: `Uploading ${Math.round(upload.percent)}%`, style: "up" };
  if (upload.state === "done") return { id, x, y, w, h, title, sub: `✓ ${upload.label}`, style: "done" };
  return { id, x, y, w, h, title, sub: "To upload", style: "up" };
};

const arrow = (id: string, on: boolean, ...points: [number, number][]): GraphEdge => ({ id, points, arrow: true, on });
const line = (id: string, on: boolean, ...points: [number, number][]): GraphEdge => ({ id, points, arrow: false, on });

export type Layer = "ortho" | "dsm" | "dtm" | "pointcloud";
export const LAYERS: Layer[] = ["ortho", "dsm", "dtm", "pointcloud"];

export const LAYER_NAMES: Record<Layer, string> = { ortho: "Orthophoto", dsm: "Terrain (DSM)", dtm: "Terrain (DTM)", pointcloud: "Point cloud" };

const PROCESSOR_TITLES: Record<Layer, string> = { ortho: "Orthophoto tiles", dsm: "Terrain · DSM", dtm: "Terrain · DTM", pointcloud: "Point cloud tiles" };
const INPUT_TITLES: Record<Layer, string> = { ortho: "Orthophoto", dsm: "DSM", dtm: "DTM", pointcloud: "Point cloud" };

export interface CreateGraphInput {
  source: "photos" | "files";
  photos: Upload;
  /** Photos only: a GCP file, else RTK or PPK positions, else the drone's GPS alone. */
  gcpFile: { on: boolean; upload: Upload };
  rtk: boolean;
  preset: "fast" | "standard" | "high";
  /** Photos: the layers ticked to build. Files: the layers a file was given for. */
  layers: Record<Layer, boolean>;
  /** Files only: each layer's upload. */
  files: Record<Layer, Upload>;
  vectors: { on: boolean; siteFiles: number; upload: Upload | null };
  design: { on: boolean; current: string | null; upload: Upload | null };
}

const ROWS: Record<Layer | "vectors" | "design", number> = { ortho: 28, dsm: 92, dtm: 156, pointcloud: 220, vectors: 284, design: 348 };
const PRESET_NAMES = { fast: "Fast", standard: "Standard", high: "High" };

/** What the viewer will show, by name, in the order the graph lists them. */
export function viewerLayers(input: CreateGraphInput): string[] {
  const out = LAYERS.filter((l) => input.layers[l]).map((l) => LAYER_NAMES[l]);
  if (input.vectors.on && (input.vectors.siteFiles > 0 || input.vectors.upload)) out.push("Site vectors");
  if (input.design.on && (input.design.current || input.design.upload) && (input.layers.dsm || input.layers.dtm)) out.push("Cut/fill vs design");
  return out;
}

/** The Create upload's pipeline: photos through photogrammetry to the tile processors, or the person's own files
 * straight to them, with the site's vectors and design beside either. */
export function createGraph(input: CreateGraphInput): Graph {
  const photos = input.source === "photos";
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const headers: GraphHeader[] = [{ x: 0, y: 0, w: 112, text: "INPUTS" }, { x: 292, y: 0, w: 136, text: "PROCESSORS" }];

  if (photos) {
    headers.splice(1, 0, { x: 148, y: 0, w: 108, text: "PHOTOGRAMMETRY" });
    nodes.push(inputNode("photos", 0, 68, 112, 48, "Drone photos", true, input.photos, ""));
    const gcp = input.gcpFile.on
      ? inputNode("gcp", 0, 180, 112, 48, "Ground control", true, input.gcpFile.upload, "")
      : input.rtk
        ? { id: "gcp", x: 0, y: 180, w: 112, h: 48, title: "Ground control", sub: "RTK photos instead", style: "skip" as const }
        : { id: "gcp", x: 0, y: 180, w: 112, h: 48, title: "Ground control", sub: "None · metres off", style: "warn" as const };
    nodes.push(gcp);
    nodes.push({ id: "odx", x: 148, y: 28, w: 108, h: 240, title: "Photogrammetry", sub: `ODX · ${PRESET_NAMES[input.preset]}`, style: "made" });
    edges.push(arrow("e-photos", true, [112, 92], [147, 92]), arrow("e-gcp", input.gcpFile.on, [112, 204], [147, 204]));
    edges.push(line("e-odx", true, [256, 148], [274, 148]), line("e-spine", true, [274, 52], [274, 244]));
  } else {
    for (const l of LAYERS) nodes.push(inputNode(`in-${l}`, 0, ROWS[l], 112, 48, INPUT_TITLES[l], input.layers[l], input.files[l], "Not provided"));
  }

  for (const l of LAYERS) {
    const on = input.layers[l];
    const sub = !on ? (photos ? "Not needed" : "Skipped") : photos ? "After photogrammetry" : "Runs on upload";
    nodes.push({ id: `p-${l}`, x: 292, y: ROWS[l], w: 136, h: 48, title: PROCESSOR_TITLES[l], sub, style: on ? "made" : "skip" });
    const y = ROWS[l] + 24;
    edges.push(photos ? arrow(`e-${l}`, on, [274, y], [291, y]) : arrow(`e-${l}`, on, [112, y], [291, y]));
  }

  const v = input.vectors;
  const vectorsIn: GraphNode = !v.on
    ? { id: "in-vectors", x: 0, y: ROWS.vectors, w: 112, h: 48, title: "Site vectors", sub: "Not used", style: "skip" }
    : v.upload && v.upload.state !== "done"
      ? inputNode("in-vectors", 0, ROWS.vectors, 112, 48, "Site vectors", true, v.upload, "")
      : v.siteFiles + (v.upload ? 1 : 0) === 0
        ? { id: "in-vectors", x: 0, y: ROWS.vectors, w: 112, h: 48, title: "Site vectors", sub: "None on the site", style: "skip" }
        : { id: "in-vectors", x: 0, y: ROWS.vectors, w: 112, h: 48, title: "Site vectors", sub: `${v.siteFiles + (v.upload ? 1 : 0)} file${v.siteFiles + (v.upload ? 1 : 0) === 1 ? "" : "s"}`, style: "site" };
  const vectorsRun: GraphNode = !v.on
    ? { id: "p-vectors", x: 292, y: ROWS.vectors, w: 136, h: 48, title: "Vector layers", sub: "Not used", style: "skip" }
    : v.upload
      ? { id: "p-vectors", x: 292, y: ROWS.vectors, w: 136, h: 48, title: "Vector layers", sub: "Runs on the new file", style: "made" }
      : { id: "p-vectors", x: 292, y: ROWS.vectors, w: 136, h: 48, title: "Vector layers", sub: v.siteFiles ? "Already on the site" : "None on the site", style: v.siteFiles ? "site" : "skip" };
  nodes.push(vectorsIn, vectorsRun);
  edges.push(arrow("e-vectors", v.on && v.siteFiles + (v.upload ? 1 : 0) > 0, [112, ROWS.vectors + 24], [291, ROWS.vectors + 24]));

  const d = input.design;
  const terrain = input.layers.dsm || input.layers.dtm;
  const designIn: GraphNode = !d.on
    ? { id: "in-design", x: 0, y: ROWS.design, w: 112, h: 48, title: "Site design", sub: "Not used", style: "skip" }
    : d.upload && d.upload.state !== "done"
      ? inputNode("in-design", 0, ROWS.design, 112, 48, "Site design", true, d.upload, "")
      : d.upload || d.current
        ? { id: "in-design", x: 0, y: ROWS.design, w: 112, h: 48, title: "Site design", sub: d.upload?.state === "done" ? d.upload.label : (d.current ?? ""), style: "site" }
        : { id: "in-design", x: 0, y: ROWS.design, w: 112, h: 48, title: "Site design", sub: "None on the site", style: "skip" };
  const hasDesign = d.on && !!(d.upload || d.current);
  const designRun: GraphNode = !hasDesign
    ? { id: "p-design", x: 292, y: ROWS.design, w: 136, h: 48, title: "Design vs survey", sub: "Not used", style: "skip" }
    : terrain
      ? { id: "p-design", x: 292, y: ROWS.design, w: 136, h: 48, title: "Design vs survey", sub: "In the viewer, after terrain", style: "made" }
      : { id: "p-design", x: 292, y: ROWS.design, w: 136, h: 48, title: "Design vs survey", sub: "Needs a DSM or DTM", style: "skip" };
  nodes.push(designIn, designRun);
  edges.push(arrow("e-design", hasDesign, [112, ROWS.design + 24], [291, ROWS.design + 24]));

  const stubs: [string, number, boolean][] = [
    ...LAYERS.map((l) => [l, ROWS[l] + 24, input.layers[l]] as [string, number, boolean]),
    ["vectors", ROWS.vectors + 24, v.on && (v.siteFiles > 0 || !!v.upload)],
    ["design", ROWS.design + 24, hasDesign && terrain],
  ];
  for (const [id, y, on] of stubs) edges.push(line(`s-${id}`, on, [428, y], [440, y]));
  const shown = viewerLayers(input).length;
  edges.push(line("bus", shown > 0, [440, 52], [440, 452]), arrow("e-viewer", shown > 0, [440, 452], [429, 452]));
  nodes.push(
    shown > 0
      ? { id: "viewer", x: 292, y: 428, w: 136, h: 48, title: "Viewer", sub: `${shown} layer${shown === 1 ? "" : "s"}`, style: "ready" }
      : { id: "viewer", x: 292, y: 428, w: 136, h: 48, title: "Viewer", sub: "Nothing yet", style: "skip" }
  );

  const graph: Graph = { width: 448, height: 500, headers, nodes, edges };
  if (!photos) {
    graph.group = { x: 0, y: 408, w: 264, h: 88, label: "NOT IN THIS PIPELINE" };
    nodes.push(
      { id: "x-photos", x: 12, y: 436, w: 104, h: 48, title: "Drone photos", sub: "Not used", style: "skip" },
      { id: "x-odx", x: 152, y: 436, w: 100, h: 48, title: "Photogrammetry", sub: "Skipped", style: "skip" }
    );
    edges.push(arrow("e-x", false, [116, 460], [151, 460]));
  }
  return graph;
}

export interface FlightGraphInput {
  source: "photos" | "processed";
  /** The drone photos, or the processed files. */
  data: Upload;
  logs: Upload;
  layers: { dsm: boolean; orthophoto: boolean; pointcloud: boolean };
  season: "pre" | "post";
}

/** A river sand flight's pipeline: the GNSS logs solved first, the photos processed with those GCPs (or the
 * vendor's files taken as they are), the layers checked against the check points, then the season's study. */
export function flightGraph(input: FlightGraphInput): Graph {
  const photos = input.source === "photos";
  const post = input.season === "post";
  const nodes: GraphNode[] = [
    inputNode("data", 0, 28, 144, 52, photos ? "Drone photos" : "Processed files", true, input.data, ""),
    inputNode("logs", 172, 28, 144, 52, "GNSS logs", true, input.logs, ""),
    { id: "reference", x: 344, y: 28, w: 144, h: 52, title: "Reference station", sub: "Workspace setting", style: "site" },
    photos
      ? { id: "odx", x: 0, y: 124, w: 144, h: 52, title: "Photogrammetry", sub: "With DGPS GCPs · NodeODX", style: "made" }
      : { id: "odx", x: 0, y: 124, w: 144, h: 52, title: "Vendor’s processing", sub: "Done by the vendor", style: "site" },
    {
      id: "dgps",
      x: 172,
      y: 124,
      w: 316,
      h: 52,
      title: "DGPS job",
      sub: photos ? "gnss-baseline · solves GCPs for photogrammetry and check points" : "gnss-baseline · solves check points for your DTM",
      style: "made",
    },
    { id: "dtm", x: 0, y: 220, w: 104, h: 48, title: "DTM", sub: "Required", style: "made" },
  ];
  const extras: [string, string, boolean, number][] = [
    ["dsm", "DSM", input.layers.dsm, 128],
    ["ortho", "Orthophoto", input.layers.orthophoto, 256],
    ["pointcloud", "Point cloud", input.layers.pointcloud, 384],
  ];
  for (const [id, title, on, x] of extras) {
    nodes.push({ id, x, y: 220, w: 104, h: 48, title, sub: on ? (photos ? "From photos" : "Your file") : "Not needed", style: on ? "made" : "skip" });
  }
  nodes.push(
    { id: "accuracy", x: 0, y: 316, w: 104, h: 52, title: "Accuracy check", sub: "Check points vs DTM", style: "made" },
    { id: "study", x: 172, y: 316, w: 144, h: 52, title: "Replenishment study", sub: post ? "Pre vs post DTM" : "After post-monsoon", style: post ? "made" : "skip" },
    post
      ? { id: "pair", x: 344, y: 316, w: 144, h: 52, title: "Pre-monsoon DTM", sub: "From the lease", style: "site" }
      : { id: "pair", x: 344, y: 316, w: 144, h: 52, title: "Lease boundary", sub: "Registered", style: "site" },
    { id: "report", x: 172, y: 412, w: 144, h: 48, title: "Report and review", sub: post ? "Vetted by the lease's officials" : "After the study", style: post ? "made" : "skip" }
  );
  const edges: GraphEdge[] = [
    arrow("e-data", true, [72, 80], [72, 123]),
    arrow("e-logs", true, [244, 80], [244, 123]),
    arrow("e-reference", true, [416, 80], [416, 123]),
    arrow("e-gcp", photos, [172, 150], [145, 150]),
    line("e-odx", true, [72, 176], [72, 198]),
    line("e-bus", true, [52, 198], [436, 198]),
    arrow("e-dtm", true, [52, 198], [52, 219]),
    arrow("e-dsm", input.layers.dsm, [180, 198], [180, 219]),
    arrow("e-ortho", input.layers.orthophoto, [308, 198], [308, 219]),
    arrow("e-pointcloud", input.layers.pointcloud, [436, 198], [436, 219]),
    arrow("e-accuracy", true, [52, 268], [52, 315]),
    arrow("e-study", post, [104, 342], [171, 342]),
    arrow("e-pair", post, [344, 342], [317, 342]),
    arrow("e-report", post, [244, 368], [244, 411]),
  ];
  return { width: 488, height: 476, headers: [{ x: 0, y: 0, w: 200, text: "FROM THE FIELD" }], nodes, edges };
}
