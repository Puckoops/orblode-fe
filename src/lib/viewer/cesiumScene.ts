import { Color, UrlTemplateImageryProvider, type Viewer as CesiumViewer } from "cesium";
import { SCENE_FALLBACK_BACKGROUND } from "@/lib/viewer/sceneStyle";

/** The page's --canvas token, so the space around the globe matches the theme the app is in. */
export function canvasColor(): Color {
  const value = typeof document === "undefined" ? "" : getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim();
  return Color.fromCssColorString(value || SCENE_FALLBACK_BACKGROUND);
}

/** Re-applies the theme's canvas colour to an already configured scene. */
export function applySceneBackground(viewer: CesiumViewer): void {
  if (viewer.isDestroyed()) return;
  const background = canvasColor();
  viewer.scene.backgroundColor = background;
  viewer.scene.globe.baseColor = background;
  viewer.scene.requestRender();
}

/** Token-free XYZ imagery for the base-map selector. */
export function makeBaseImageryProvider(id: string): UrlTemplateImageryProvider {
  if (id === "satellite") {
    return new UrlTemplateImageryProvider({
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      minimumLevel: 0,
      maximumLevel: 19,
    });
  }
  const style = id === "streets" ? "light_all" : "dark_all";
  return new UrlTemplateImageryProvider({
    url: `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}.png`,
    subdomains: "abcd",
    minimumLevel: 0,
    maximumLevel: 19,
  });
}

/**
 * One-time scene look: the theme's canvas behind the globe, with no starfield. Cesium leaves
 * skyBox stars on by default; with skyAtmosphere off they read as white noise
 * wherever Ion imagery has not streamed in yet (common after hard refresh).
 */
export function configureCesiumScene(viewer: CesiumViewer): void {
  const { scene } = viewer;
  // Pairs with the <Viewer requestRenderMode> prop: never re-render just
  // because simulation time advanced — every scene mutation in the app calls
  // scene.requestRender() explicitly. Cuts idle GPU/CPU to near zero.
  scene.maximumRenderTimeChange = Infinity;
  scene.backgroundColor = canvasColor();
  scene.fog.enabled = false;
  if (scene.skyBox) scene.skyBox.show = false;
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
  if (scene.sun) scene.sun.show = false;
  if (scene.moon) scene.moon.show = false;
  scene.globe.showGroundAtmosphere = false;
  scene.globe.baseColor = canvasColor();
  scene.globe.depthTestAgainstTerrain = true;
}
