"use client";

// The dot laid on the scene where the cross-section chart's cursor is along
// the line, clamped to the ground so it sits on the surface in 2D and 3D.

import { useEffect, useRef } from "react";
import { Cartesian3, Color, ConstantPositionProperty, HeightReference, type Entity } from "cesium";

import { useCesiumViewer } from "@/lib/viewer/state/cesiumContext";
import { HANDLE_FILL, PROFILE_MARKER } from "@/lib/viewer/sceneStyle";

export function useProfileMarker(position: { lon: number; lat: number } | null): void {
  const { viewerRef, viewerReady } = useCesiumViewer();
  const markerRef = useRef<Entity | null>(null);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer) return;
    const marker = viewer.entities.add({
      show: false,
      position: new ConstantPositionProperty(Cartesian3.ZERO),
      point: {
        pixelSize: 12,
        color: Color.fromCssColorString(PROFILE_MARKER),
        outlineColor: Color.fromCssColorString(HANDLE_FILL),
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    markerRef.current = marker;
    return () => {
      markerRef.current = null;
      if (!viewer.isDestroyed()) {
        viewer.entities.remove(marker);
        viewer.scene.requestRender();
      }
    };
  }, [viewerRef, viewerReady]);

  const lon = position?.lon ?? null;
  const lat = position?.lat ?? null;
  useEffect(() => {
    const viewer = viewerRef.current;
    const marker = markerRef.current;
    if (!viewer || viewer.isDestroyed() || !marker) return;
    if (lon === null || lat === null) {
      marker.show = false;
    } else {
      (marker.position as ConstantPositionProperty).setValue(Cartesian3.fromDegrees(lon, lat));
      marker.show = true;
    }
    viewer.scene.requestRender();
  }, [viewerRef, viewerReady, lon, lat]);
}
