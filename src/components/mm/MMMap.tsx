"use client";

import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ConstantPositionProperty,
  Entity as CesiumEntity,
  Math as CesiumMath,
  PolygonHierarchy,
  Rectangle,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer as CesiumViewer,
} from "cesium";
import { useCallback, useEffect, useRef, useState } from "react";
import { Viewer } from "resium";
import type { CesiumComponentRef } from "resium";
import { configureCesiumScene, makeBaseImageryProvider } from "@/lib/viewer/cesiumScene";
import type { GeoJSONGeometry, LonLat } from "@/lib/api/mm";

// A flat-looking map for the minor-minerals screens: GeoJSON areas, flight lines and points, with points the
// planner may drag. Cesium is imperative here: entities are rebuilt when the props change.

export type AreaKind = "lease" | "buffer" | "safety" | "mask" | "nogo" | "effective";

export interface MapArea {
  id: string;
  kind: AreaKind;
  geometry: GeoJSONGeometry;
  label?: string;
}

export interface MapPoint {
  id: string;
  at: LonLat;
  auto?: LonLat;
  tone: "gcp" | "check" | "nogo" | "moved" | "pending";
  label?: string;
  /** Rings drawn around the auto position while the point is being moved, in metres. */
  rings?: number[];
}

const STYLE: Record<AreaKind, { line: string; fill?: string; dash?: boolean; width: number }> = {
  lease: { line: "#f2a33a", fill: "rgba(242,163,58,0.10)", width: 3 },
  effective: { line: "#5aa3e6", fill: "rgba(90,163,230,0.12)", width: 2 },
  buffer: { line: "#9aabc2", dash: true, width: 2 },
  safety: { line: "#f2847b", dash: true, width: 2 },
  mask: { line: "#5aa3e6", fill: "rgba(90,163,230,0.45)", width: 2 },
  nogo: { line: "#f2847b", fill: "rgba(242,132,123,0.25)", width: 2 },
};

const POINT: Record<MapPoint["tone"], string> = {
  gcp: "#f2a33a",
  check: "#ffffff",
  nogo: "#f2847b",
  moved: "#5fc48a",
  pending: "#f2847b",
};

function rings(g: GeoJSONGeometry): [number, number][][] {
  if (g.type === "Polygon") return (g.coordinates as [number, number][][]).slice(0, 1);
  if (g.type === "MultiPolygon") return (g.coordinates as [number, number][][][]).map((p) => p[0]);
  return [];
}

function points(g: GeoJSONGeometry): [number, number][] {
  if (g.type === "Point") return [g.coordinates as [number, number]];
  if (g.type === "MultiPoint") return g.coordinates as [number, number][];
  return [];
}

function bounds(areas: MapArea[], pts: MapPoint[]): Rectangle | null {
  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  const take = ([x, y]: [number, number]) => {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  };
  for (const a of areas) {
    rings(a.geometry).forEach((r) => r.forEach(take));
    points(a.geometry).forEach(take);
  }
  pts.forEach((p) => take([p.at.lon, p.at.lat]));
  if (w > e) return null;
  const padX = Math.max((e - w) * 0.15, 0.0008);
  const padY = Math.max((n - s) * 0.15, 0.0008);
  return Rectangle.fromDegrees(w - padX, s - padY, e + padX, n + padY);
}

export function MMMap({
  areas,
  lines = [],
  points: pts = [],
  draggable = false,
  onDrop,
  onPick,
  className,
  height = 520,
}: {
  areas: MapArea[];
  lines?: [LonLat, LonLat][];
  points?: MapPoint[];
  draggable?: boolean;
  /** A dragged point let go at `to`. */
  onDrop?: (id: string, to: LonLat) => void;
  /** A click on the map away from any point, for drawing. */
  onPick?: (at: LonLat) => void;
  className?: string;
  height?: number;
}) {
  const viewerRef = useRef<CesiumViewer | null>(null);
  const [ready, setReady] = useState(false);
  const framed = useRef(false);
  const dragging = useRef<{ id: string; entity: CesiumEntity } | null>(null);
  const dropRef = useRef(onDrop);
  const pickRef = useRef(onPick);
  useEffect(() => {
    dropRef.current = onDrop;
    pickRef.current = onPick;
  });

  const handleRef = useCallback((e: CesiumComponentRef<CesiumViewer> | null) => {
    const viewer = e?.cesiumElement;
    if (!viewer || viewer.isDestroyed() || viewerRef.current === viewer) return;
    configureCesiumScene(viewer);
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(makeBaseImageryProvider("satellite"));
    viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    viewerRef.current = viewer;
    setReady(true);
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    viewer.entities.removeAll();
    for (const a of areas) {
      const st = STYLE[a.kind];
      for (const r of rings(a.geometry)) {
        const positions = Cartesian3.fromDegreesArray(r.flat());
        viewer.entities.add({
          id: `${a.kind}:${a.id}:${positions.length}:${Math.random()}`,
          name: a.label,
          polygon: st.fill
            ? { hierarchy: new PolygonHierarchy(positions), material: Color.fromCssColorString(st.fill), outline: false, classificationType: undefined }
            : undefined,
          polyline: {
            positions,
            width: st.width,
            clampToGround: true,
            material: Color.fromCssColorString(st.line),
          },
        });
      }
      for (const [x, y] of points(a.geometry)) {
        viewer.entities.add({ position: Cartesian3.fromDegrees(x, y), point: { pixelSize: 9, color: Color.fromCssColorString(st.line) }, name: a.label });
      }
    }
    lines.forEach(([a, b], i) =>
      viewer.entities.add({
        id: `line:${i}`,
        polyline: { positions: Cartesian3.fromDegreesArray([a.lon, a.lat, b.lon, b.lat]), width: 1.5, clampToGround: true, material: Color.fromCssColorString("#5aa3e6") },
      })
    );
    for (const p of pts) {
      if (p.auto && (p.auto.lon !== p.at.lon || p.auto.lat !== p.at.lat)) {
        viewer.entities.add({ position: Cartesian3.fromDegrees(p.auto.lon, p.auto.lat), point: { pixelSize: 8, color: Color.WHITE.withAlpha(0.35) } });
        viewer.entities.add({
          polyline: { positions: Cartesian3.fromDegreesArray([p.auto.lon, p.auto.lat, p.at.lon, p.at.lat]), width: 1, clampToGround: true, material: Color.WHITE.withAlpha(0.6) },
        });
      }
      for (const r of p.rings ?? []) {
        const centre = p.auto ?? p.at;
        viewer.entities.add({
          position: Cartesian3.fromDegrees(centre.lon, centre.lat),
          ellipse: { semiMajorAxis: r, semiMinorAxis: r, fill: false, outline: true, outlineColor: Color.WHITE.withAlpha(0.5), height: 0 },
        });
      }
      viewer.entities.add({
        id: `point:${p.id}`,
        position: Cartesian3.fromDegrees(p.at.lon, p.at.lat),
        point: { pixelSize: 12, color: Color.fromCssColorString(POINT[p.tone]), outlineColor: Color.BLACK, outlineWidth: 1.5 },
        label: p.label
          ? { text: p.label, font: "12px sans-serif", pixelOffset: new Cartesian2(0, -18), fillColor: Color.WHITE, showBackground: true, backgroundColor: Color.BLACK.withAlpha(0.6) }
          : undefined,
      });
    }
    if (!framed.current) {
      const rect = bounds(areas, pts);
      if (rect) {
        viewer.camera.setView({ destination: rect });
        framed.current = true;
      }
    }
    viewer.scene.requestRender();
  }, [ready, areas, lines, pts]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!ready || !viewer || viewer.isDestroyed()) return;
    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    const lonLatAt = (pos: Cartesian2): LonLat | null => {
      const c = viewer.camera.pickEllipsoid(pos, viewer.scene.globe.ellipsoid);
      if (!c) return null;
      const g = Cartographic.fromCartesian(c);
      return { lon: CesiumMath.toDegrees(g.longitude), lat: CesiumMath.toDegrees(g.latitude) };
    };
    handler.setInputAction((e: { position: Cartesian2 }) => {
      if (!draggable) return;
      const picked = viewer.scene.pick(e.position);
      const entity = picked?.id as CesiumEntity | undefined;
      if (entity?.id?.startsWith("point:")) {
        dragging.current = { id: entity.id.slice(6), entity };
        viewer.scene.screenSpaceCameraController.enableInputs = false;
      }
    }, ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction((e: { endPosition: Cartesian2 }) => {
      if (!dragging.current) return;
      const at = lonLatAt(e.endPosition);
      if (at) {
        dragging.current.entity.position = new ConstantPositionProperty(Cartesian3.fromDegrees(at.lon, at.lat));
        viewer.scene.requestRender();
      }
    }, ScreenSpaceEventType.MOUSE_MOVE);
    handler.setInputAction((e: { position: Cartesian2 }) => {
      viewer.scene.screenSpaceCameraController.enableInputs = true;
      const drag = dragging.current;
      dragging.current = null;
      if (!drag) return;
      const at = lonLatAt(e.position);
      if (at) dropRef.current?.(drag.id, at);
    }, ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction((e: { position: Cartesian2 }) => {
      if (!pickRef.current) return;
      const picked = viewer.scene.pick(e.position);
      if ((picked?.id as CesiumEntity | undefined)?.id?.startsWith("point:")) return;
      const at = lonLatAt(e.position);
      if (at) pickRef.current(at);
    }, ScreenSpaceEventType.LEFT_CLICK);
    return () => handler.destroy();
  }, [ready, draggable]);

  return (
    <div className={className} style={{ position: "relative", height, borderRadius: 12, overflow: "hidden" }}>
      <Viewer
        ref={handleRef}
        full={false}
        timeline={false}
        animation={false}
        geocoder={false}
        baseLayerPicker={false}
        navigationHelpButton={false}
        homeButton={false}
        sceneModePicker={false}
        fullscreenButton={false}
        infoBox={false}
        selectionIndicator={false}
        requestRenderMode
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
