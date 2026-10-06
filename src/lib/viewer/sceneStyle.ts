// The Cesium scene's colours and materials, and the data legends that must match them. This is data
// rendering, not chrome, so it is the one module allowed literal colours; everything else takes
// colour from Camelot's tokens.

/** Site markers on the dashboard globe. */
export const SITE_MARKER = { fill: "#FF8A4C", outline: "#FFFFFF", pixelSize: 14, outlineWidth: 2 } as const;
