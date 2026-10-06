// The Cesium scene's colours and materials, and the data legends that must match them. This is data
// rendering, not chrome, so it is the one module allowed literal colours: everything else takes
// colour from Camelot's tokens. Values are CSS colour strings so this stays importable without
// Cesium (and under `node --test`); scene code wraps them with Color.fromCssColorString.

/** Selection, draft strokes, the profile hover marker and the default measurement colour. */
export const SCENE_ACCENT = "#C97A4E";

/** Behind the globe when the --canvas token cannot be read. */
export const SCENE_FALLBACK_BACKGROUND = "#000000";

/** Site markers on the dashboard globe. */
export const SITE_MARKER = { fill: "#FF8A4C", outline: "#FFFFFF", pixelSize: 14, outlineWidth: 2 } as const;

/** Vertex handles, edit ghosts and outlines drawn over measurements. */
export const HANDLE_FILL = "#FFFFFF";
export const HANDLE_OUTLINE = "#000000";

/** The ring over a vertex the cursor is snapping to. */
export const SNAP_HALO = "#00FFFF";

/** The backdrop behind draft segment labels. */
export const DRAFT_LABEL_BACKGROUND = "#18181B";

/** The line a cross-section or GCP check is drawn along. */
export const PROFILE_LINE = "#7DD3FC";

/** A design file's outline overlay. */
export const DESIGN_OVERLAY = "#A78BFA";

/** Colours a person can give a measurement; the first is the default. Stored on the row, so keep the values. */
export const MEASUREMENT_SWATCHES = ["#C97A4E", "#6366F1", "#EF4444", "#22C55E", "#EAB308", "#3B82F6", "#F4F4F5"] as const;
