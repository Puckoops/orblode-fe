"use client";

// Camera orientation + idle fade for the HUD camera control (FR-05).
//
// Extracted from the standalone OrientationGizmo when the compass rose was
// folded into CameraJoystick: the pose reading and the auto-fade are
// widget-agnostic, and keeping them here stops the joystick component from
// growing a second concern.
//
// Two outputs, deliberately different in kind:
//   • `heading` / `pitch` are STATE — they change the drawing, so they belong in
//     the render cycle, but only past a 0.5° gate. An orbiting camera fires
//     `changed` continuously and re-rendering React at that rate costs more than
//     a widget this size is worth.
//   • `hudRef` receives the opacity DIRECTLY as a style write. Fading is pure
//     presentation with no bearing on the drawing, so routing it through state
//     would queue a render on every camera nudge purely to change one number.

import { useCallback, useEffect, useRef, useState } from "react";
import { Math as CesiumMath, type Viewer as CesiumViewer } from "cesium";

import {
  GIZMO_IDLE_MS,
  GIZMO_IDLE_OPACITY,
  normalizeBearing,
} from "@/lib/viewer/cameraControls";

/** Below this the change is invisible at HUD scale — skipping it keeps an
 * orbiting camera from re-rendering React every frame. */
const POSE_EPSILON_DEG = 0.5;

export interface CameraOrientation {
  /** Degrees clockwise from true North, 0 ≤ h < 360. */
  heading: number;
  /** Degrees from the horizon; negative looks down. */
  pitch: number;
  /** Attach to the element that should fade when the camera goes idle. */
  hudRef: React.RefObject<HTMLDivElement | null>;
  /** Cancel the idle countdown and restore full opacity — call it when the user
   * takes hold of the control, so it can't dim mid-drag. */
  wake: () => void;
}

export function useCameraOrientation(
  viewerRef: React.RefObject<CesiumViewer | null>,
  ready: boolean
): CameraOrientation {
  const [pose, setPose] = useState({ heading: 0, pitch: -45 });
  const hudRef = useRef<HTMLDivElement | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Last pose we rendered — the epsilon gate reads this from a ref so the camera
  // listener never needs `pose` as a dependency.
  const lastPose = useRef({ heading: 0, pitch: -45 });

  const wake = useCallback(() => {
    if (hudRef.current) hudRef.current.style.opacity = "1";
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (hudRef.current) hudRef.current.style.opacity = String(GIZMO_IDLE_OPACITY);
    }, GIZMO_IDLE_MS);
  }, []);

  // Camera → pose; camera movement also counts as activity.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;

    const read = () => {
      if (viewer.isDestroyed()) return;
      const heading = normalizeBearing(CesiumMath.toDegrees(viewer.camera.heading));
      const pitch = CesiumMath.toDegrees(viewer.camera.pitch);
      const prev = lastPose.current;
      if (
        Math.abs(heading - prev.heading) < POSE_EPSILON_DEG &&
        Math.abs(pitch - prev.pitch) < POSE_EPSILON_DEG
      ) {
        return;
      }
      lastPose.current = { heading, pitch };
      setPose({ heading, pitch });
    };

    const onCameraMove = () => {
      wake();
      read();
    };

    read();
    wake();
    viewer.camera.changed.addEventListener(onCameraMove);
    viewer.camera.moveEnd.addEventListener(onCameraMove);
    return () => {
      viewer.camera.changed.removeEventListener(onCameraMove);
      viewer.camera.moveEnd.removeEventListener(onCameraMove);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [ready, viewerRef, wake]);

  // FR-05: "restores to 100% on pointer move". The listener is on the window, not
  // the widget, so moving the mouse anywhere over the viewer brings the control
  // back — by the time a hand reaches it, it is already at full opacity.
  useEffect(() => {
    if (!ready) return;
    window.addEventListener("pointermove", wake, { passive: true });
    return () => window.removeEventListener("pointermove", wake);
  }, [ready, wake]);

  return { heading: pose.heading, pitch: pose.pitch, hudRef, wake };
}
