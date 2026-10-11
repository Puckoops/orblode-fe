"use client";

import { useEffect, useState } from "react";
import {
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  Ellipsoid,
  GeometryInstance,
  GroundPolylineGeometry,
  GroundPolylinePrimitive,
  IntersectionTests,
  Material,
  Math as CesiumMath,
  PolylineMaterialAppearance,
  Ray,
} from "cesium";

import {
  containsExtent,
  edgeCrossings,
  formatGridSpacing,
  formatGridValue,
  gridLevel,
  gridValues,
  labelStep,
  minorOpacity,
  spreadAlong,
  squareAround,
  visibleSpacing,
  type EdgeSample,
  type Extent,
  type GridLevel,
} from "@/lib/viewer/grid";
import { pickScenePosition } from "@/lib/viewer/measure";
import {
  getWorkingTransform,
  projectedUnits,
  utmEpsgCode,
  type WorkingTransform,
} from "@/lib/viewer/projection";
import { GRID_INK, GRID_INK_ON_LIGHT_MAP, GRID_OPACITY } from "@/lib/viewer/sceneStyle";
import { useCesiumViewer } from "@/lib/viewer/state/cesiumContext";
import { useViewerStore, useViewerStoreApi } from "@/lib/viewer/state/store";

/** How far lines reach from the screen centre, in half canvas diagonals at the centre's scale. */
const MINOR_REACH = 1.1;
const MAJOR_REACH = 3;
const BUILD_MARGIN = 1.3;
const MINOR_MIN_OPACITY = 0.03;
/** Past this major spacing the view is regional and the grid steps aside. */
const MAX_MAJOR_M = 10_000;
const SEGMENT_M = 2_000;
const LABEL_STEP_PX = 48;
const LABEL_INSET_PX = 12;
const LABEL_GAP_BOTTOM_PX = 96;
const LABEL_GAP_RIGHT_PX = 40;
const LABEL_CORNER_PX = 104;
const LABEL_HALF_WIDTH_PX = 48;
const SETTLE_MS = 50;

interface Lines {
  primitive: GroundPolylinePrimitive;
  colour: Color;
}

interface Build {
  level: GridLevel;
  minorExtent: Extent | null;
  majorExtent: Extent;
  minor: Lines | null;
  major: Lines | null;
}

interface GridLabel {
  key: string;
  edge: "bottom" | "right";
  at: number;
  text: string;
}

interface LabelState {
  items: GridLabel[];
  shown: boolean;
}

const NO_LABELS: LabelState = { items: [], shown: false };

const covers = (have: Extent | null, want: Extent | null) => !want || (!!have && containsExtent(have, want));
const within = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

/** Lines of constant easting and northing in the working CRS, draped on the surface, spaced by the zoom. */
export function ViewGrid() {
  const { viewerRef, viewerReady } = useCesiumViewer();
  const store = useViewerStoreApi();
  const visible = useViewerStore((s) => s.gridVisible);
  const hasManifest = useViewerStore((s) => s.manifest !== null);
  const workingCrs = useViewerStore((s) => s.manifest?.survey.working_crs || null);
  const [labels, setLabels] = useState<LabelState>(NO_LABELS);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !visible || !hasManifest || !viewer || viewer.isDestroyed()) return;
    const { scene, camera } = viewer;
    const canvas = scene.canvas;
    const radii = scene.globe.ellipsoid.radii;

    let alive = true;
    // undefined while the working CRS resolves; null when it could not and the UTM fallback is due.
    let transform: WorkingTransform | null | undefined = workingCrs ? undefined : null;
    let fallbackAsked = false;
    let ground: Ellipsoid | null = null;
    let current: Build | null = null;
    let pending: Build | null = null;
    let unitsPerPx = 0;
    let moving = false;
    let size = "";
    let spacingShown: string | null = null;
    let labelled = false;
    let labelTimer: ReturnType<typeof setTimeout> | null = null;

    const adopt = (t: WorkingTransform | null) => {
      if (!alive) return;
      transform = t;
      scene.requestRender();
    };
    if (workingCrs) getWorkingTransform(workingCrs).then(adopt, () => adopt(null));

    const scratchCarto = new Cartographic();
    const scratchRay = new Ray();
    const scratchCentre = new Cartesian3();
    const scratchOffset = new Cartesian3();
    const scratchPixel = new Cartesian2();

    const toGrid = (p: Cartesian3): [number, number] | null => {
      const c = Cartographic.fromCartesian(p, scene.globe.ellipsoid, scratchCarto);
      if (!c || !transform) return null;
      const en = transform.forward([CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude)]);
      return Number.isFinite(en[0]) && Number.isFinite(en[1]) ? en : null;
    };

    const toWorld = (e: number, n: number): Cartesian3 | null => {
      if (!transform) return null;
      const [lon, lat] = transform.inverse([e, n]);
      return Number.isFinite(lon) && Number.isFinite(lat) ? Cartesian3.fromDegrees(lon, lat) : null;
    };

    const refreshGround = () => {
      if (!alive || viewer.isDestroyed()) return;
      const p = pickScenePosition(viewer, new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
      const height = p ? Cartographic.fromCartesian(p)?.height : undefined;
      if (height === undefined) return;
      ground = new Ellipsoid(radii.x + height, radii.y + height, radii.z + height);
    };

    /** The ground under the screen centre and the scale there, both in CRS units. */
    const measure = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!ground || w === 0 || h === 0) return null;
      const ray = camera.getPickRay(Cartesian2.fromElements(w / 2, h / 2, scratchPixel), scratchRay);
      const hit = ray && IntersectionTests.rayEllipsoid(ray, ground);
      if (!ray || !hit || hit.start <= 0) return null;
      const centre = Ray.getPoint(ray, hit.start, scratchCentre);

      if (transform === null && !fallbackAsked) {
        fallbackAsked = true;
        const c = Cartographic.fromCartesian(centre);
        const code = utmEpsgCode(CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude));
        getWorkingTransform(`EPSG:${code}`).then(adopt, () => adopt(null));
      }
      const here = toGrid(centre);
      if (!here) return null;
      const c = Cartographic.fromCartesian(centre);
      const step = Cartesian3.fromRadians(c.longitude, c.latitude + 1e-5, c.height);
      const there = toGrid(step);
      if (!there) return null;
      const unitsPerMetre = Math.hypot(there[0] - here[0], there[1] - here[1]) / Cartesian3.distance(centre, step);

      const depth = Cartesian3.dot(Cartesian3.subtract(centre, camera.positionWC, scratchOffset), camera.directionWC);
      const pixel = camera.frustum.getPixelDimensions(w, h, depth, 1, scratchPixel);
      return {
        e: here[0],
        n: here[1],
        unitsPerMetre,
        unitsPerPx: Math.max(pixel.x, pixel.y) * unitsPerMetre,
        halfDiagonalPx: Math.hypot(w, h) / 2,
      };
    };

    const linesIn = (extent: Extent, spacing: number, skipEvery: number, unitsPerMetre: number): GeometryInstance[] => {
      const line = (e0: number, n0: number, e1: number, n1: number) => {
        const lengthM = Math.hypot(e1 - e0, n1 - n0) / unitsPerMetre;
        const segments = Math.min(32, Math.max(1, Math.ceil(lengthM / SEGMENT_M)));
        const positions: Cartesian3[] = [];
        for (let i = 0; i <= segments; i++) {
          const p = toWorld(e0 + ((e1 - e0) * i) / segments, n0 + ((n1 - n0) * i) / segments);
          if (!p) return null;
          positions.push(p);
        }
        return new GeometryInstance({ geometry: new GroundPolylineGeometry({ positions, width: 1 }) });
      };
      const instances: GeometryInstance[] = [];
      for (const e of gridValues(extent.minE, extent.maxE, spacing, skipEvery)) {
        const l = line(e, extent.minN, e, extent.maxN);
        if (l) instances.push(l);
      }
      for (const n of gridValues(extent.minN, extent.maxN, spacing, skipEvery)) {
        const l = line(extent.minE, n, extent.maxE, n);
        if (l) instances.push(l);
      }
      return instances;
    };

    const addLines = (instances: GeometryInstance[]): Lines | null => {
      if (instances.length === 0) return null;
      const material = Material.fromType("Color", { color: Color.WHITE.withAlpha(0) });
      const primitive = new GroundPolylinePrimitive({
        geometryInstances: instances,
        appearance: new PolylineMaterialAppearance({ material }),
        allowPicking: false,
      });
      // First in the collection, so it draws before the data sources' ground primitives and under the measurements.
      scene.groundPrimitives.add(primitive, 0);
      return { primitive, colour: material.uniforms.color as Color };
    };

    const build = (level: GridLevel, minorExtent: Extent | null, majorExtent: Extent, unitsPerMetre: number): Build => ({
      level,
      minorExtent,
      majorExtent,
      minor: minorExtent && addLines(linesIn(minorExtent, level.minor, 10, unitsPerMetre)),
      major: addLines(linesIn(majorExtent, level.major, 0, unitsPerMetre)),
    });

    const ready = (b: Build) => (!b.minor || b.minor.primitive.ready) && (!b.major || b.major.primitive.ready);

    const discard = (b: Build) => {
      if (viewer.isDestroyed()) return;
      for (const lines of [b.minor, b.major]) if (lines) scene.groundPrimitives.remove(lines.primitive);
    };

    const paint = (lines: Lines | null, ink: string, alpha: number) => {
      if (!lines) return;
      Color.fromCssColorString(ink, lines.colour);
      lines.colour.alpha = alpha;
      lines.primitive.show = alpha > 0.002;
    };

    const publish = (spacing: string | null) => {
      if (spacing === spacingShown) return;
      spacingShown = spacing;
      store.getState().setGridSpacing(spacing);
    };

    const hide = () => {
      for (const b of [current, pending]) {
        if (!b) continue;
        if (b.minor) b.minor.primitive.show = false;
        if (b.major) b.major.primitive.show = false;
      }
      publish(null);
      if (labelled) {
        labelled = false;
        setLabels(NO_LABELS);
      }
    };

    const placeLabels = () => {
      labelTimer = null;
      if (!alive || moving || viewer.isDestroyed()) return;
      const b = current;
      if (!b || !transform || !(unitsPerPx > 0) || spacingShown === null) return;
      const spacing = visibleSpacing(b.level, unitsPerPx);
      const extent = spacing === b.level.minor && b.minorExtent ? b.minorExtent : b.majorExtent;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      const sampleEdge = (length: number, point: (at: number) => Cartesian2) => {
        const samples: ({ at: number; e: number; n: number } | null)[] = [];
        for (let at = 0; at <= length; at += LABEL_STEP_PX) {
          const p = pickScenePosition(viewer, point(at));
          const en = p && toGrid(p);
          samples.push(en ? { at, e: en[0], n: en[1] } : null);
        }
        return samples;
      };

      const labelEdge = (
        edge: GridLabel["edge"],
        length: number,
        point: (at: number) => Cartesian2,
        gap: number,
        from: number,
        to: number
      ) => {
        const step = labelStep(spacing, unitsPerPx, gap);
        const samples = sampleEdge(length, point);
        const onE = samples.map((s): EdgeSample | null => s && { at: s.at, value: s.e, other: s.n });
        const onN = samples.map((s): EdgeSample | null => s && { at: s.at, value: s.n, other: s.e });
        const found: { at: number; text: string }[] = [];
        for (const c of edgeCrossings(onE, step)) {
          if (within(c.value, extent.minE, extent.maxE) && within(c.other, extent.minN, extent.maxN)) {
            found.push({ at: c.at, text: `E ${formatGridValue(c.value, step)}` });
          }
        }
        for (const c of edgeCrossings(onN, step)) {
          if (within(c.value, extent.minN, extent.maxN) && within(c.other, extent.minE, extent.maxE)) {
            found.push({ at: c.at, text: `N ${formatGridValue(c.value, step)}` });
          }
        }
        return spreadAlong(
          found.filter((f) => f.at > from && f.at < to),
          gap
        ).map((f, i) => ({ ...f, edge, key: `${edge}-${i}-${f.text}` }));
      };

      const bottom = labelEdge(
        "bottom",
        w,
        (x) => new Cartesian2(x, h - LABEL_INSET_PX),
        LABEL_GAP_BOTTOM_PX,
        LABEL_HALF_WIDTH_PX,
        w - LABEL_CORNER_PX
      );
      const right = labelEdge(
        "right",
        h,
        (y) => new Cartesian2(w - LABEL_INSET_PX, y),
        LABEL_GAP_RIGHT_PX,
        LABEL_INSET_PX,
        h - 2 * LABEL_INSET_PX
      );
      const items = [...bottom, ...right];
      labelled = items.length > 0;
      setLabels({ items, shown: true });
    };

    const scheduleLabels = () => {
      if (labelTimer) clearTimeout(labelTimer);
      labelTimer = setTimeout(placeLabels, SETTLE_MS);
    };

    const frame = () => {
      const nextSize = `${canvas.clientWidth}x${canvas.clientHeight}`;
      if (nextSize !== size) {
        size = nextSize;
        if (!moving) scheduleLabels();
      }
      const view = measure();
      const level = view && gridLevel(view.unitsPerPx);
      if (!view || !level || level.major / view.unitsPerMetre > MAX_MAJOR_M) return hide();
      unitsPerPx = view.unitsPerPx;

      const reach = view.halfDiagonalPx * unitsPerPx;
      const wantMinor =
        minorOpacity(level.minor, unitsPerPx) >= MINOR_MIN_OPACITY ? squareAround(view.e, view.n, reach * MINOR_REACH) : null;
      const wantMajor = squareAround(view.e, view.n, reach * MAJOR_REACH);
      const target = pending ?? current;
      if (
        !target ||
        target.level.minor !== level.minor ||
        !covers(target.minorExtent, wantMinor) ||
        !containsExtent(target.majorExtent, wantMajor)
      ) {
        if (pending) discard(pending);
        pending = build(
          level,
          wantMinor && squareAround(view.e, view.n, reach * MINOR_REACH * BUILD_MARGIN),
          squareAround(view.e, view.n, reach * MAJOR_REACH * BUILD_MARGIN),
          view.unitsPerMetre
        );
      }
      if (pending && ready(pending)) {
        if (current) discard(current);
        current = pending;
        pending = null;
        if (!moving) scheduleLabels();
      }
      // An async primitive only advances when the scene renders.
      if (pending) scene.requestRender();

      if (current) {
        const ink = store.getState().view.baseMap === "streets" ? GRID_INK_ON_LIGHT_MAP : GRID_INK;
        paint(current.major, ink, GRID_OPACITY);
        paint(current.minor, ink, GRID_OPACITY * minorOpacity(current.level.minor, unitsPerPx));
      }
      publish(formatGridSpacing(visibleSpacing(level, unitsPerPx), projectedUnits(transform!.def)));
    };

    const removePreRender = scene.preRender.addEventListener(frame);
    const removeMoveStart = camera.moveStart.addEventListener(() => {
      moving = true;
      if (labelTimer) clearTimeout(labelTimer);
      labelTimer = null;
      if (labelled) setLabels((l) => ({ ...l, shown: false }));
    });
    const removeMoveEnd = camera.moveEnd.addEventListener(() => {
      moving = false;
      refreshGround();
      scene.requestRender();
      scheduleLabels();
    });
    const start = setTimeout(() => {
      refreshGround();
      scene.requestRender();
    }, 0);

    return () => {
      alive = false;
      clearTimeout(start);
      if (labelTimer) clearTimeout(labelTimer);
      removePreRender();
      removeMoveStart();
      removeMoveEnd();
      for (const b of [current, pending]) if (b) discard(b);
      store.getState().setGridSpacing(null);
      setLabels(NO_LABELS);
      if (!viewer.isDestroyed()) scene.requestRender();
    };
  }, [viewerRef, viewerReady, visible, hasManifest, workingCrs, store]);

  if (!visible || labels.items.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-150 ${
        labels.shown ? "opacity-100" : "opacity-0"
      }`}
    >
      {labels.items.map((l) => (
        <span
          key={l.key}
          className="num-sm absolute rounded-xs bg-surface/80 px-1 whitespace-nowrap text-ink-2"
          style={
            l.edge === "bottom"
              ? { left: l.at, bottom: 4, transform: "translateX(-50%)" }
              : { right: 4, top: l.at, transform: "translateY(-50%)" }
          }
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}
