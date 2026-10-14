// Framing a measurement over the survey surface. Cesium frames a Rectangle for
// the ellipsoid (height 0), so over a site that stands 150 m up the camera lands
// in the ground; these helpers find the surface under the shape and lift the
// framing by it.

import {
  Cartesian3,
  Cartographic,
  Rectangle,
  SceneMode,
  sampleTerrainMostDetailed,
  type Viewer as CesiumViewer,
} from "cesium";

const SPOT_LIMIT = 12;
const TERRAIN_WAIT_MS = 1500;

/** Where to read the surface before framing a shape: the middle of its frame,
 * then its own vertices thinned to fit `limit`, so a long line still costs a
 * handful of picks. */
export function framingSpots(rect: Rectangle, vertices: Cartesian3[], limit = SPOT_LIMIT): Cartographic[] {
  const spots = [Rectangle.center(rect)];
  const step = Math.max(1, Math.ceil(vertices.length / Math.max(limit - 1, 1)));
  for (let i = 0; i < vertices.length; i += step) {
    const c = Cartographic.fromCartesian(vertices[i]);
    if (c) spots.push(c);
  }
  return spots;
}

/** The highest finite height, or undefined when none is known. */
export function highestSurface(heights: Iterable<number | undefined>): number | undefined {
  let top: number | undefined;
  for (const h of heights) {
    if (typeof h === "number" && Number.isFinite(h) && (top === undefined || h > top)) top = h;
  }
  return top;
}

/** Where the scene draws a true height under vertical exaggeration; 2D squashes
 * everything towards the relative height. */
export function drawnHeight(height: number, exaggeration: number, relativeHeight: number): number {
  return (height - relativeHeight) * exaggeration + relativeHeight;
}

/** A camera position framed over the ellipsoid, raised to stand as high over
 * `ground` as it stood over height 0. */
export function raiseOverGround(position: Cartesian3, ground: number): Cartesian3 {
  const c = Cartographic.fromCartesian(position);
  if (!c) return position;
  return Cartesian3.fromRadians(c.longitude, c.latitude, c.height + ground);
}

function drawnSurfaceNow(viewer: CesiumViewer, spot: Cartographic): number | undefined {
  const { scene } = viewer;
  if (scene.mode === SceneMode.SCENE3D && scene.sampleHeightSupported) {
    const h = scene.sampleHeight(spot);
    if (h !== undefined) return h;
  }
  return scene.globe.getHeight(spot);
}

/** The highest drawn surface under the spots: terrain, mesh and points in view,
 * then cached terrain tiles. When none of the spots is loaded the terrain
 * provider is asked, which can take a fetch, so that wait is capped. */
export async function groundUnder(viewer: CesiumViewer, spots: Cartographic[]): Promise<number | undefined> {
  const now = highestSurface(spots.map((spot) => drawnSurfaceNow(viewer, spot)));
  if (now !== undefined) return now;

  const terrain = viewer.terrainProvider;
  if (!terrain.availability) return undefined;
  const sampled = spots.map((c) => new Cartographic(c.longitude, c.latitude));
  const landed = await Promise.race([
    sampleTerrainMostDetailed(terrain, sampled).then(
      () => true,
      () => false
    ),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), TERRAIN_WAIT_MS)),
  ]);
  if (!landed || viewer.isDestroyed()) return undefined;
  const { verticalExaggeration, verticalExaggerationRelativeHeight } = viewer.scene;
  return highestSurface(
    sampled.map((c) => drawnHeight(c.height, verticalExaggeration, verticalExaggerationRelativeHeight))
  );
}
