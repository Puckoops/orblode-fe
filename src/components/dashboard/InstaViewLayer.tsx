"use client";

import {
  Cartesian3,
  Color,
  CzmlDataSource,
  GeoJsonDataSource,
  GpxDataSource,
  KmlDataSource,
  Math as CesiumMath,
  Rectangle,
  type DataSource,
  type JulianDate,
  type PolygonHierarchy,
  type Viewer,
} from "cesium";
import { useEffect, useEffectEvent, useRef } from "react";
import { useCesium } from "resium";
import {
  framingBounds,
  jsonOverlayFormat,
  overlayLoadError,
  type Bounds,
  type InstaOverlay,
  type OverlayFocus,
  type OverlayFormat,
} from "@/lib/dashboard/instaView";
import { VECTOR_OVERLAY } from "@/lib/viewer/sceneStyle";

const STROKE = Color.fromCssColorString(VECTOR_OVERLAY);
const FILL = STROKE.withAlpha(0.15);

interface Loaded {
  source: DataSource;
  skippedParts: boolean;
}

async function loadOverlay(file: File, format: OverlayFormat, viewer: Viewer): Promise<Loaded> {
  if (format === "kml") {
    const source = new KmlDataSource({ camera: viewer.scene.camera, canvas: viewer.scene.canvas });
    let skippedParts = false;
    source.unsupportedNodeEvent.addEventListener(() => {
      skippedParts = true;
    });
    await source.load(file, { clampToGround: true, screenOverlayContainer: viewer.container });
    return { source, skippedParts };
  }
  if (format === "gpx") return { source: await GpxDataSource.load(file, { clampToGround: true }), skippedParts: false };

  const parsed: unknown = JSON.parse(await file.text());
  const source =
    jsonOverlayFormat(file.name, parsed) === "czml"
      ? await CzmlDataSource.load(parsed)
      : await GeoJsonDataSource.load(parsed, { clampToGround: true, stroke: STROKE, fill: FILL, strokeWidth: 2, markerColor: STROKE });
  return { source, skippedParts: false };
}

function overlayBounds(source: DataSource, time: JulianDate): Bounds | null {
  const points: Cartesian3[] = [];
  for (const entity of source.entities.values) {
    const position = entity.position?.getValue(time);
    if (position) points.push(position);
    const line: Cartesian3[] | undefined = entity.polyline?.positions?.getValue(time);
    if (line) points.push(...line);
    const hierarchy: PolygonHierarchy | undefined = entity.polygon?.hierarchy?.getValue(time);
    if (hierarchy) points.push(...hierarchy.positions);
    const area: Rectangle | undefined = entity.rectangle?.coordinates?.getValue(time);
    if (area) points.push(Cartesian3.fromRadians(area.west, area.south), Cartesian3.fromRadians(area.east, area.north));
  }
  if (points.length === 0) return null;
  const r = Rectangle.fromCartesianArray(points);
  return {
    west: CesiumMath.toDegrees(r.west),
    south: CesiumMath.toDegrees(r.south),
    east: CesiumMath.toDegrees(r.east),
    north: CesiumMath.toDegrees(r.north),
  };
}

// Not viewer.flyTo(source): that frames the drawn primitives, and for points clamped to this
// terrain-less globe it lands the camera tens of kilometres underground.
function flyToOverlay(viewer: Viewer, source: DataSource) {
  const bounds = overlayBounds(source, viewer.clock.currentTime);
  if (!bounds) return;
  const b = framingBounds(bounds);
  viewer.camera.flyTo({ destination: Rectangle.fromDegrees(b.west, b.south, b.east, b.north) });
}

/** One Insta View file on the dashboard globe: drawn once it loads, then flown to. */
export function InstaViewLayer({
  overlay,
  focus,
  onLoaded,
  onFailed,
}: {
  overlay: InstaOverlay;
  focus: OverlayFocus | null;
  onLoaded: (overlay: InstaOverlay, entities: number, skippedParts: boolean) => void;
  onFailed: (overlay: InstaOverlay, message: string) => void;
}) {
  const { viewer } = useCesium();
  const sourceRef = useRef<DataSource | null>(null);
  const { id, file, format, visible } = overlay;

  const isVisible = useEffectEvent(() => visible);
  const settle = useEffectEvent((outcome: Loaded | { error: unknown }) => {
    if ("error" in outcome) {
      console.error(`Insta View couldn't draw ${file.name}:`, outcome.error);
      onFailed(overlay, overlayLoadError(file.name, outcome.error));
    } else {
      onLoaded(overlay, outcome.source.entities.values.length, outcome.skippedParts);
    }
  });

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;

    loadOverlay(file, format, viewer)
      .then(async (loaded) => {
        if (cancelled || viewer.isDestroyed()) return;
        loaded.source.show = isVisible();
        await viewer.dataSources.add(loaded.source);
        // The add settles a microtask later, so an unmount in between finds nothing to remove.
        if (cancelled) {
          if (!viewer.isDestroyed()) viewer.dataSources.remove(loaded.source, true);
          return;
        }
        sourceRef.current = loaded.source;
        settle(loaded);
        flyToOverlay(viewer, loaded.source);
      })
      .catch((error: unknown) => {
        if (!cancelled) settle({ error });
      });

    return () => {
      cancelled = true;
      const source = sourceRef.current;
      sourceRef.current = null;
      if (source && !viewer.isDestroyed()) viewer.dataSources.remove(source, true);
    };
  }, [viewer, file, format]);

  useEffect(() => {
    if (sourceRef.current) sourceRef.current.show = visible;
  }, [visible]);

  useEffect(() => {
    const source = sourceRef.current;
    if (focus?.id !== id || !source || !viewer || viewer.isDestroyed()) return;
    flyToOverlay(viewer, source);
  }, [focus, id, viewer]);

  return null;
}
