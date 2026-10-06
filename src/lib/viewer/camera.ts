// Camera pose serialization (viewer-shell §5.3). One format
// (`CameraPose` — degrees, meters, ellipsoidal height) feeds three sinks: the
// URL codec (§5.2), bookmarks and presets (§5.7). Capture does NOT round — the
// codec is responsible for its own precision formatting (§5.2), so bookmarks
// keep full fidelity.
//
// `cesium` is externalized to `window.Cesium` at build time (next.config.ts),
// mirroring the other lib/viewer/* Cesium modules; there is no top-level Cesium
// side effect here, so this module is import-safe.

import {
  Cartesian2,
  Cartesian3,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  defined,
  type Viewer as CesiumViewer,
} from "cesium";

import type { CameraPose } from "@/lib/viewer/state/store";
import {
  NORTH_RESET_MS,
  TOP_DOWN_PITCH_DEG,
  easeInOutCubic,
  needsNorthReset,
  restorePitch,
  shortestBearingDelta,
  type ProjectionMode,
} from "./cameraControls.ts";

/** Read the live camera into the serialization format. positionCartographic →
 * lon/lat/h; heading/pitch/roll radians → degrees. No rounding (§5.3). */
export function captureCameraPose(viewer: CesiumViewer): CameraPose {
  const { camera } = viewer;
  const carto = camera.positionCartographic;
  return {
    lon: CesiumMath.toDegrees(carto.longitude),
    lat: CesiumMath.toDegrees(carto.latitude),
    h: carto.height,
    heading: CesiumMath.toDegrees(camera.heading),
    pitch: CesiumMath.toDegrees(camera.pitch),
    roll: CesiumMath.toDegrees(camera.roll),
  };
}

/** Apply a pose to the camera. Default is an instant `setView` (used on URL
 * restore, §5.6 step 4); `animate` runs a 1.2s `flyTo` (bookmarks/presets,
 * §5.7). Destination from degrees, orientation in radians (§5.3). */
export function applyCameraPose(
  viewer: CesiumViewer,
  pose: CameraPose,
  opts?: { animate?: boolean }
): void {
  const destination = Cartesian3.fromDegrees(pose.lon, pose.lat, pose.h);
  const orientation = {
    heading: CesiumMath.toRadians(pose.heading),
    pitch: CesiumMath.toRadians(pose.pitch),
    roll: CesiumMath.toRadians(pose.roll),
  };
  if (opts?.animate) {
    viewer.camera.flyTo({ destination, orientation, duration: 1.2 });
  } else {
    viewer.camera.setView({ destination, orientation });
  }
}

/**
 * The world point to orbit around: whatever is under the centre of the viewport.
 * Depth buffer first (terrain, 3D tiles, reality mesh), then the globe ray, then
 * the ellipsoid, and finally a point straight ahead so there is ALWAYS a pivot —
 * even with the camera pointed at the sky.
 *
 * Lifted verbatim from CameraJoystick's private `computePivot` so the joystick,
 * the compass reset and the projection switch all orbit the same point; three
 * copies of this precedence chain would drift apart.
 */
export function screenCenterPivot(viewer: CesiumViewer): Cartesian3 {
  const { scene, camera } = viewer;
  const canvas = scene.canvas;
  const center = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);

  if (scene.pickPositionSupported) {
    const picked = scene.pickPosition(center);
    if (defined(picked)) return picked;
  }
  const ray = camera.getPickRay(center);
  const onGlobe = ray ? scene.globe.pick(ray, scene) : undefined;
  if (onGlobe) return onGlobe;
  const onEllipsoid = camera.pickEllipsoid(center, scene.globe.ellipsoid);
  if (onEllipsoid) return onEllipsoid;

  return Cartesian3.add(
    camera.position,
    Cartesian3.multiplyByScalar(camera.direction, 1000, new Cartesian3()),
    new Cartesian3()
  );
}

/** Cancels a running camera animation. Idempotent. */
export type CancelAnimation = () => void;

/**
 * Eases the camera's heading and/or pitch to a target while holding the pivot
 * point and the distance to it fixed — FR-03's "aligns to North while retaining
 * pivot point and zoom altitude", and the same motion FR-06 uses to drop into a
 * plan view.
 *
 * Each frame re-aims with `lookAt(pivot, HeadingPitchRange)` rather than
 * accumulating relative `rotateRight` calls: the absolute form cannot drift over
 * the animation, and its heading argument is measured from North exactly like
 * `camera.heading`, so no sign conventions have to be reasoned about. The
 * transform is released every frame (`lookAtTransform(IDENTITY)`) so Cesium's own
 * controls keep working the instant the animation ends.
 *
 * Heading interpolation goes the SHORT way (`shortestBearingDelta`), so a camera
 * at 350° swings 10° forward instead of unwinding almost a full turn.
 *
 * Returns a cancel function; calling it stops the animation where it stands.
 */
export function animateCameraOrbit(
  viewer: CesiumViewer,
  opts: {
    toHeadingDeg?: number;
    toPitchDeg?: number;
    durationMs: number;
    onDone?: () => void;
  }
): CancelAnimation {
  const { scene, camera } = viewer;
  const pivot = screenCenterPivot(viewer);
  const range = Cartesian3.distance(camera.position, pivot);

  const startHeading = CesiumMath.toDegrees(camera.heading);
  const startPitch = CesiumMath.toDegrees(camera.pitch);
  const targetHeading = opts.toHeadingDeg ?? startHeading;
  const targetPitch = opts.toPitchDeg ?? startPitch;
  const headingDelta = shortestBearingDelta(startHeading, targetHeading);
  const pitchDelta = targetPitch - startPitch;

  let raf = 0;
  let cancelled = false;
  const t0 = performance.now();

  const aim = (headingDeg: number, pitchDeg: number) => {
    camera.lookAt(
      pivot,
      new HeadingPitchRange(
        CesiumMath.toRadians(headingDeg),
        CesiumMath.toRadians(pitchDeg),
        range
      )
    );
    // Release the reference frame or Cesium's screen-space controller stays
    // locked to the pivot after the animation finishes.
    camera.lookAtTransform(Matrix4.IDENTITY);
    scene.requestRender();
  };

  const frame = (now: number) => {
    if (cancelled || viewer.isDestroyed()) return;
    const elapsed = now - t0;
    const t = opts.durationMs > 0 ? Math.min(elapsed / opts.durationMs, 1) : 1;
    const eased = easeInOutCubic(t);
    aim(startHeading + headingDelta * eased, startPitch + pitchDelta * eased);

    if (t < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      // Land on the exact target — an eased approach that stops a hundredth of a
      // degree short leaves a compass that never quite reads 0.0°.
      aim(targetHeading, targetPitch);
      opts.onDone?.();
    }
  };

  raf = requestAnimationFrame(frame);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

/**
 * FR-03 — swing the camera to true North over 300ms, keeping the pivot and
 * altitude. A camera already facing North is a no-op (returns a cancel that does
 * nothing) rather than a 300ms animation to where it already is.
 */
export function resetToNorth(
  viewer: CesiumViewer,
  onDone?: () => void
): CancelAnimation {
  if (!needsNorthReset(CesiumMath.toDegrees(viewer.camera.heading))) {
    onDone?.();
    return () => {};
  }
  return animateCameraOrbit(viewer, {
    toHeadingDeg: 0,
    durationMs: NORTH_RESET_MS,
    onDone,
  });
}

/** FR-06's morph duration — long enough to read as a transition, short enough
 * not to feel like waiting. */
export const PROJECTION_MORPH_MS = 400;

/**
 * FR-06 — switch between a 3D perspective orbit and a 90° top-down orthographic
 * plan view.
 *
 * Deliberately NOT `scene.morphTo2D`: Cesium's SCENE2D mode cannot render 3D
 * tilesets, which would blank the site model, terrain mesh and point cloud the
 * moment the user pressed the button. Swapping the camera's frustum instead
 * keeps the scene in SCENE3D — everything carries on rendering — while giving a
 * true orthographic projection, which is what "orthographic" actually means
 * here.
 *
 * The pitch animates alongside the swap so the focal point is never lost.
 */
export function applyProjectionMode(
  viewer: CesiumViewer,
  mode: ProjectionMode,
  restorePitchDeg: number | null
): CancelAnimation {
  const camera = viewer.camera;
  if (mode === "orthographic") {
    camera.switchToOrthographicFrustum();
    return animateCameraOrbit(viewer, {
      toPitchDeg: TOP_DOWN_PITCH_DEG,
      durationMs: PROJECTION_MORPH_MS,
    });
  }
  camera.switchToPerspectiveFrustum();
  return animateCameraOrbit(viewer, {
    toPitchDeg: restorePitch(restorePitchDeg),
    durationMs: PROJECTION_MORPH_MS,
  });
}
