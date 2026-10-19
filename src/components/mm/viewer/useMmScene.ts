"use client";

import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Math as CesiumMath,
  PolygonHierarchy,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Entity,
  type Viewer as CesiumViewer,
} from "cesium";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONGeometry, LonLat } from "@/lib/api/mm";
import { useCesiumViewer } from "@/lib/viewer/state/cesiumContext";

export interface Overlay {
  id: string;
  geometry: GeoJSONGeometry;
  line: string;
  fill?: string;
  width?: number;
}

function rings(g: GeoJSONGeometry): [number, number][][] {
  switch (g.type) {
    case "Polygon":
      return [(g.coordinates as [number, number][][])[0]];
    case "MultiPolygon":
      return (g.coordinates as [number, number][][][]).map((p) => p[0]);
    case "LineString":
      return [g.coordinates as [number, number][]];
    default:
      return [];
  }
}

/** Lays the lease, the masks and the section lines on the viewer's own scene, clamped to the ground, for as long as the
 * panel is open. */
export function useMmOverlay(overlays: Overlay[]) {
  const { viewerRef, viewerReady } = useCesiumViewer();
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer || viewer.isDestroyed()) return;
    const added: Entity[] = [];
    for (const o of overlays) {
      for (const r of rings(o.geometry)) {
        const positions = Cartesian3.fromDegreesArray(r.flat());
        added.push(
          viewer.entities.add({
            polyline: { positions, width: o.width ?? 2, clampToGround: true, material: Color.fromCssColorString(o.line) },
            polygon: o.fill && o.geometry.type !== "LineString" ? { hierarchy: new PolygonHierarchy(positions), material: Color.fromCssColorString(o.fill) } : undefined,
          })
        );
      }
    }
    viewer.scene.requestRender();
    return () => {
      if (viewer.isDestroyed()) return;
      for (const e of added) viewer.entities.remove(e);
      viewer.scene.requestRender();
    };
  }, [viewerRef, viewerReady, overlays]);
}

function lonLatAt(viewer: CesiumViewer, pos: Cartesian2): LonLat | null {
  const onScene = viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(pos) : undefined;
  const c = onScene ?? viewer.camera.pickEllipsoid(pos, viewer.scene.globe.ellipsoid);
  if (!c) return null;
  const g = Cartographic.fromCartesian(c);
  return { lon: CesiumMath.toDegrees(g.longitude), lat: CesiumMath.toDegrees(g.latitude) };
}

/** A polygon drawn by clicking its corners on the viewer, closed by a double click or Enter, abandoned by Escape. Kept
 * apart from the measurement tools: nothing it draws becomes a measurement. */
export function useMmPolygonDraw(onDone: (ring: LonLat[]) => void) {
  const { viewerRef, viewerReady } = useCesiumViewer();
  const [drawing, setDrawing] = useState(false);
  const [count, setCount] = useState(0);
  const points = useRef<LonLat[]>([]);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  const finish = useCallback(() => {
    const ring = points.current.filter((p, i, all) => i === 0 || Math.hypot(p.lon - all[i - 1].lon, p.lat - all[i - 1].lat) > 2e-6);
    setDrawing(false);
    if (ring.length >= 3) doneRef.current(ring);
  }, []);
  const cancel = useCallback(() => setDrawing(false), []);
  const start = useCallback(() => {
    points.current = [];
    setCount(0);
    setDrawing(true);
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!drawing || !viewerReady || !viewer || viewer.isDestroyed()) return;
    const outline = viewer.entities.add({
      polyline: {
        positions: [],
        width: 2,
        clampToGround: true,
        material: Color.fromCssColorString("#5aa3e6"),
      },
    });
    const redraw = () => {
      const ring = points.current;
      const closed = ring.length >= 3 ? [...ring, ring[0]] : ring;
      (outline.polyline as unknown as { positions: Cartesian3[] }).positions = Cartesian3.fromDegreesArray(closed.flatMap((p) => [p.lon, p.lat]));
      setCount(ring.length);
      viewer.scene.requestRender();
    };
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((e: { position: Cartesian2 }) => {
      const at = lonLatAt(viewer, e.position);
      if (!at) return;
      points.current = [...points.current, at];
      redraw();
    }, ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction(() => finish(), ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") finish();
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      handler.destroy();
      if (!viewer.isDestroyed()) {
        viewer.entities.remove(outline);
        viewer.scene.requestRender();
      }
    };
  }, [drawing, viewerRef, viewerReady, finish, cancel]);

  return { drawing, count, start, finish, cancel };
}
