"use client";

// The 3D half of the cross-section hover bridge (FR-09's "hover marker on the
// 2D chart syncs bidirectionally with the 3D canvas point").
//
// Two directions, one store field (`profileHover`, carrying the chainage plus
// WHO moved last), and two effects that deliberately never feed each other:
//
//   chart → 3D   `profileHover.source === "chart"` → place a marker entity at
//                that chainage along the selected line.
//   3D → chart   cursor moves near the selected line → write the chainage with
//                source "scene"; the chart lights up the matching station.
//
// The `source` tag is what stops the loop. Without it the chart's own hover
// would come back as an external index and the scene's would come back as a
// marker move, each re-triggering the other every frame.
//
// The marker is a raw Cesium Entity held in a ref, never in the store — the
// §3.2 rule that scene handles stay out of Zustand. It is created once and
// repositioned through a CallbackProperty, so a pointer sweep along the chart
// moves it at render rate with zero React re-renders and zero entity churn.

import { useEffect, useRef, type RefObject } from "react";
import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  HeightReference,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer as CesiumViewer,
} from "cesium";

import type { Measurement } from "@/lib/api/orblodeSvc";
import {
  chainageAtPosition,
  geometryPositions,
  pickScenePosition,
  positionAtChainage,
} from "@/lib/viewer/measure";
import type { ViewerShellState } from "@/lib/viewer/state/store";
import type { StoreApi } from "zustand";
import { ACCENT, HANDLE } from "@/components/viewer/shell/sceneHelpers";

/** Pointer sampling cadence, matching the StatusBar's cursor readout. A depth
 * pick per mousemove event would run far ahead of what the eye resolves. */
const HOVER_SAMPLE_MS = 60;

/** How far off the line (metres) the cursor may stray and still light up a
 * station. Generous enough to forgive an imprecise mouse on a thin polyline,
 * tight enough that hovering the wider site clears the marker. */
const HOVER_RADIUS_M = 25;

export function useProfileHoverMarker(deps: {
  viewerReady: boolean;
  viewerRef: RefObject<CesiumViewer | null>;
  store: StoreApi<ViewerShellState>;
  /** The selected cross_section, or null — the bridge is inert otherwise. */
  measurement: Measurement | null;
}) {
  const { viewerReady, viewerRef, store, measurement } = deps;

  // The line's world vertices, recomputed only when the geometry changes.
  const positionsRef = useRef<Cartesian3[]>([]);
  // The live marker position the CallbackProperty reads each frame.
  const markerPosRef = useRef<Cartesian3 | null>(null);

  const geometry = measurement?.geometry;
  const isCrossSection = measurement?.kind === "cross_section";

  useEffect(() => {
    positionsRef.current =
      isCrossSection && geometry ? geometryPositions(geometry) : [];
  }, [isCrossSection, geometry]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer || viewer.isDestroyed()) return;
    if (!isCrossSection) return;

    const entity = viewer.entities.add({
      position: new CallbackProperty(
        () => markerPosRef.current ?? undefined,
        false // not a constant — it moves with the hover
      ) as unknown as Cartesian3,
      point: {
        pixelSize: 11,
        color: ACCENT,
        outlineColor: HANDLE,
        outlineWidth: 2,
        // Clamped so the dot sits ON the surface rather than floating at the
        // sample's raw z, which may predate the currently loaded terrain LOD.
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      // `show` is a callback too, so clearing the hover hides the dot without
      // adding/removing the entity (which would flash and churn the collection).
      show: new CallbackProperty(
        () => markerPosRef.current !== null,
        false
      ) as unknown as boolean,
    });

    const unsubscribe = store.subscribe((state) => {
      const hover = state.profileHover;
      // The scene is the mover here — echoing its own chainage back into a
      // marker is harmless, so both sources drive the dot. What matters is that
      // this never WRITES to the store.
      markerPosRef.current = hover
        ? positionAtChainage(positionsRef.current, hover.chainage)
        : null;
    });

    return () => {
      unsubscribe();
      markerPosRef.current = null;
      if (!viewer.isDestroyed()) viewer.entities.remove(entity);
    };
  }, [viewerReady, viewerRef, store, isCrossSection]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer || viewer.isDestroyed()) return;
    if (!isCrossSection) return;

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    let lastSample = 0;

    handler.setInputAction((movement: ScreenSpaceEventHandler.MotionEvent) => {
      const now = performance.now();
      if (now - lastSample < HOVER_SAMPLE_MS) return;
      lastSample = now;

      const state = store.getState();
      // While the POINTER is over the chart, the chart owns the hover. Bailing
      // here (rather than overwriting) is what keeps the two from fighting when
      // the mouse is on the panel and the canvas still sees a stale move.
      if (state.profileHover?.source === "chart") return;

      const positions = positionsRef.current;
      if (positions.length < 2) return;

      const world = pickScenePosition(
        viewer,
        new Cartesian2(movement.endPosition.x, movement.endPosition.y)
      );
      const chainage = world
        ? chainageAtPosition(positions, world, HOVER_RADIUS_M)
        : null;

      // Only write on a real change: an unchanged null (the common case — the
      // cursor is nowhere near the line) must not notify subscribers 16 times a
      // second.
      if (chainage === null) {
        if (state.profileHover !== null) state.setProfileHover(null);
        return;
      }
      state.setProfileHover({ chainage, source: "scene" });
    }, ScreenSpaceEventType.MOUSE_MOVE);

    return () => {
      handler.destroy();
      // Leaving a scene-sourced hover behind would strand a marker on a line the
      // user has already deselected.
      if (store.getState().profileHover?.source === "scene") {
        store.getState().setProfileHover(null);
      }
    };
  }, [viewerReady, viewerRef, store, isCrossSection]);

  // Selecting a different measurement must not inherit the previous one's hover.
  useEffect(() => {
    return () => {
      if (store.getState().profileHover !== null) store.getState().setProfileHover(null);
    };
  }, [store, measurement?.id]);
}
