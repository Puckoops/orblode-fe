// The Cesium scene's colours and materials, and the data legends that must match them. This is data
// rendering, not chrome, so it is the one module allowed literal colours: everything else takes
// colour from Camelot's tokens. Values are CSS colour strings so this stays importable without
// Cesium (and under `node --test`); scene code wraps them with Color.fromCssColorString.

/** Selection, draft strokes and the default measurement colour. */
export const SCENE_ACCENT = "#C97A4E";

/** Behind the globe when the --canvas token cannot be read. */
export const SCENE_FALLBACK_BACKGROUND = "#000000";

/** Site markers on the dashboard globe. */
export const SITE_MARKER = { fill: "#FF8A4C", outline: "#FFFFFF", pixelSize: 14, outlineWidth: 2 } as const;

/** Vertex handles, edit ghosts and outlines drawn over measurements. */
export const HANDLE_FILL = "#FFFFFF";
export const HANDLE_OUTLINE = "#000000";

/** The ring over a vertex the cursor is snapping to, and the surface cursor while it snaps. */
export const SNAP_HALO = "#00FFFF";

/** The surface cursor (the Orblode mark laid on the scene) and the dark edge that keeps it legible over imagery. */
export const CURSOR_INK = "#FFFFFF";
export const CURSOR_EDGE = "rgba(0, 0, 0, 0.55)";

/** The backdrop behind draft segment labels. */
export const DRAFT_LABEL_BACKGROUND = "#18181B";

/** The view grid: light over imagery and the dark map, dark over the light street map. Minor lines fade in up to the same opacity. */
export const GRID_INK = "#FFFFFF";
export const GRID_INK_ON_LIGHT_MAP = "#27272A";
export const GRID_OPACITY = 0.55;

/** Vector overlays: contours, boundaries and other uploaded vectors. */
export const VECTOR_OVERLAY = "#7DD3FC";

/** The ramp orblode-svc draws a measurement heatmap with (orblode_heatmap):
 * strong and light cut below the base, light and strong fill above it. */
export const HEATMAP_RAMP = {
  cut: "rgb(178, 24, 43)",
  cutLight: "rgb(239, 138, 98)",
  fillLight: "rgb(103, 169, 207)",
  fill: "rgb(33, 102, 172)",
} as const;

/** A design file's outline overlay. */
export const DESIGN_OVERLAY = "#A78BFA";

/** Colours a person can give a measurement; the first is the default. Stored on the row, so keep the values. */
export const MEASUREMENT_SWATCHES = ["#C97A4E", "#6366F1", "#EF4444", "#22C55E", "#EAB308", "#3B82F6", "#F4F4F5"] as const;
