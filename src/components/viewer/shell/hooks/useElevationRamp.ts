"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Viewer as CesiumViewer } from "cesium";
import type { LayerControl } from "@/components/viewer/LayerPanel";
import type { ViewSettings } from "@/lib/viewer/state/store";
import { autoRange, noDataFloor } from "@/lib/viewer/elevationRamp";
import { ElevationMaterial, surveyFrame } from "@/lib/viewer/elevationMaterial";

/** Tints the visible survey surface by height and shades its relief with a globe material, or clears it. */
export function useElevationRamp(
  viewerRef: RefObject<CesiumViewer | null>,
  viewerReady: boolean,
  terrain: LayerControl | null,
  view: Pick<ViewSettings, "elevationColors" | "elevationRamp" | "elevationRange" | "elevationOpacity" | "elevationBands" | "shading">
) {
  const holderRef = useRef<ElevationMaterial | null>(null);
  const bboxKey = terrain?.bbox?.join(",") ?? "";
  const frame = useMemo(() => surveyFrame(bboxKey ? bboxKey.split(",").map(Number) : undefined), [bboxKey]);
  const stats = terrain?.stats;
  const { elevationColors, elevationRamp, elevationRange, elevationOpacity, elevationBands, shading } = view;

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer || viewer.isDestroyed()) return;
    const { scene } = viewer;
    const colors = elevationColors && !!stats;
    const hillshade = shading === "Hillshade";
    if (!frame || (!colors && !hillshade)) {
      if (scene.globe.material) {
        scene.globe.material = undefined;
        scene.requestRender();
      }
      return;
    }
    const look = {
      colors,
      shading: hillshade,
      ramp: elevationRamp,
      range: elevationRange ?? (stats ? autoRange(stats) : { min: 0, max: 1 }),
      bands: elevationBands,
      opacity: elevationOpacity,
      floor: stats ? noDataFloor(stats) : -Infinity,
    };
    if (holderRef.current) holderRef.current.update(frame, look);
    else holderRef.current = new ElevationMaterial(frame, look);
    const holder = holderRef.current;
    if (scene.globe.material !== holder.material) scene.globe.material = holder.material;
    const sync = () => holder.syncExaggeration(scene);
    // A new ramp canvas is picked up on one frame and uploaded on the next, and requestRenderMode draws neither unasked.
    const again = () => {
      scene.postRender.removeEventListener(again);
      scene.requestRender();
    };
    scene.preRender.addEventListener(sync);
    scene.postRender.addEventListener(again);
    scene.requestRender();
    return () => {
      scene.preRender.removeEventListener(sync);
      scene.postRender.removeEventListener(again);
    };
  }, [viewerReady, viewerRef, elevationColors, elevationRamp, elevationRange, elevationOpacity, elevationBands, shading, stats, frame]);

  useEffect(
    () => () => {
      const viewer = viewerRef.current;
      const holder = holderRef.current;
      if (!holder) return;
      if (viewer && !viewer.isDestroyed() && viewer.scene.globe.material === holder.material) {
        viewer.scene.globe.material = undefined;
      }
      holder.destroy();
      holderRef.current = null;
    },
    [viewerRef]
  );
}
