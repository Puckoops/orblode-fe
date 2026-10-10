"use client";

// The selected measurement's cut/fill heatmap: one single-tile imagery layer of
// the PNG orblode-svc draws, fetched again whenever the measurement is updated
// (a recompute or a params edit), and removed when the toggle goes off or the
// selection moves to another measurement.

import { useEffect, type RefObject } from "react";
import { ImageryLayer, Rectangle, SingleTileImageryProvider, type Viewer as CesiumViewer } from "cesium";
import type { StoreApi } from "zustand/vanilla";

import { getMeasurementHeatmap } from "@/lib/api/orblodeSvc";
import { stripErrNamespace } from "@/lib/api/errors";
import type { ViewerShellState } from "@/lib/viewer/state/store";

export function useMeasurementHeatmap(deps: {
  viewerReady: boolean;
  viewerRef: RefObject<CesiumViewer | null>;
  store: StoreApi<ViewerShellState>;
  surveyId: string;
  /** The measurement the heatmap was asked for; null when it is off. */
  measurementId: string | null;
  selectedMeasurementId: string | null;
  /** Changes whenever the measurement is updated, so the picture follows it. */
  stamp: string;
}) {
  const { viewerReady, viewerRef, store, surveyId, measurementId, selectedMeasurementId, stamp } = deps;

  useEffect(() => {
    if (measurementId && measurementId !== selectedMeasurementId) store.getState().setHeatmap(null);
  }, [store, measurementId, selectedMeasurementId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer || !measurementId) return;
    let cancelled = false;
    let layer: ImageryLayer | null = null;
    store.getState().setHeatmap({ measurementId, status: "loading" });

    (async () => {
      try {
        const h = await getMeasurementHeatmap(surveyId, measurementId);
        const provider = await SingleTileImageryProvider.fromUrl(h.image, { rectangle: Rectangle.fromDegrees(...h.bounds) });
        if (cancelled || viewer.isDestroyed()) return;
        layer = viewer.imageryLayers.addImageryProvider(provider);
        viewer.scene.requestRender();
        store.getState().setHeatmap({ measurementId, status: "ready", scaleM: h.scale_m, deadbandM: h.deadband_m });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? stripErrNamespace(err.message) : "The heatmap could not be drawn.";
        store.getState().setHeatmap({ measurementId, status: "error", error: message });
      }
    })();

    return () => {
      cancelled = true;
      if (layer && !viewer.isDestroyed()) {
        viewer.imageryLayers.remove(layer, true);
        viewer.scene.requestRender();
      }
    };
  }, [viewerReady, viewerRef, store, surveyId, measurementId, stamp]);
}
