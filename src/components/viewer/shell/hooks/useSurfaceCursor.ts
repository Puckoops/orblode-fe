"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import {
  Cartesian2,
  Cartesian3,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Viewer as CesiumViewer,
} from "cesium";
import type { ActorRefFrom } from "xstate";
import type { StoreApi } from "zustand/vanilla";

import type { interactionMachine } from "@/lib/viewer/interaction/machine";
import type { Vec3 } from "@/lib/viewer/interaction/types";
import { pickScenePosition } from "@/lib/viewer/measure";
import { CURSOR_EDGE, CURSOR_INK, SNAP_HALO } from "@/lib/viewer/sceneStyle";
import type { ViewerShellState } from "@/lib/viewer/state/store";
import {
  CURSOR_DOT_PX,
  CURSOR_RING_PX,
  easeNormal,
  markGeometry,
  planeNormal,
} from "@/lib/viewer/surfaceCursor";
import type { AdapterRefs } from "./useInteractionAdapter";

type InteractionActor = ActorRefFrom<typeof interactionMachine>;

const SVG_NS = "http://www.w3.org/2000/svg";
const SAMPLE_MS = 32;
const SAMPLE_ANGLES = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
const CROSS_PX = 3;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  parent?.appendChild(el);
  return el;
}

/** The Orblode mark as the draw cursor: its ring lies on the surface under the pointer and its line stands on the surface normal. */
export function useSurfaceCursor(
  viewerRef: RefObject<CesiumViewer | null>,
  viewerReady: boolean,
  actor: InteractionActor,
  store: StoreApi<ViewerShellState>,
  refs: AdapterRefs
): void {
  useEffect(() => {
    if (!viewerReady) return;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const scene = viewer.scene;
    const canvas = scene.canvas;
    const { hoverRef, snapPreviewRef, nearOriginRef } = refs;

    const root = svg("svg", {
      "aria-hidden": "true",
      style: "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible",
    });
    const mark = svg("g", { display: "none", fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, root);
    const disc = svg("path", { stroke: "none", "fill-opacity": 0.14 }, mark);
    const layers = [
      { g: svg("g", { stroke: CURSOR_EDGE, "stroke-width": 4 }, mark), dotR: CURSOR_DOT_PX + 1, crossW: 3.5, fill: CURSOR_EDGE },
      { g: svg("g", { "stroke-width": 2 }, mark), dotR: CURSOR_DOT_PX, crossW: 1.5, fill: "" },
    ].map(({ g, dotR, crossW, fill }) => ({
      g,
      ring: svg("path", {}, g),
      stem: svg("path", {}, g),
      cross: svg("path", { "stroke-width": crossW }, g),
      dot: svg("circle", { r: dotR, stroke: "none", ...(fill ? { fill } : {}) }, g),
    }));
    const ink = layers[1];
    viewer.cesiumWidget.container.appendChild(root);

    let inside = false;
    let shown = false;
    let colour = "";
    let probeHover: Cartesian3 | null = null;
    let target: Vec3 | null = null;
    let normal: Vec3 | null = null;
    let lastMouse: Cartesian2 | null = null;
    let lastSample = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;

    const placing = () => actor.getSnapshot().value === "placing";
    const probing = () => store.getState().probing;

    const setColour = (next: string) => {
      if (next === colour) return;
      colour = next;
      ink.g.setAttribute("stroke", next);
      ink.dot.setAttribute("fill", next);
      disc.setAttribute("fill", next);
    };

    const hide = () => {
      if (!shown) return;
      shown = false;
      mark.setAttribute("display", "none");
      canvas.style.cursor = "";
    };

    const show = () => {
      if (shown) return;
      shown = true;
      mark.removeAttribute("display");
      canvas.style.cursor = "none";
    };

    const sampleNormal = (at: Cartesian2): Vec3 | null => {
      const picks: Cartesian3[] = [];
      for (const angle of SAMPLE_ANGLES) {
        const offset = new Cartesian2(at.x + CURSOR_RING_PX * Math.cos(angle), at.y + CURSOR_RING_PX * Math.sin(angle));
        const p = pickScenePosition(viewer, offset);
        if (!p) return null;
        picks.push(p);
      }
      const toward = Cartesian3.subtract(viewer.camera.positionWC, picks[0], new Cartesian3());
      return planeNormal(picks[0], picks[1], picks[2], toward);
    };

    const resample = () => {
      trailing = null;
      if (!lastMouse || viewer.isDestroyed()) return;
      lastSample = performance.now();
      target = sampleNormal(lastMouse);
      scene.requestRender();
    };

    const handler = new ScreenSpaceEventHandler(canvas);
    handler.setInputAction((movement: ScreenSpaceEventHandler.MotionEvent) => {
      inside = true;
      const isProbing = !placing() && probing();
      if (!placing() && !isProbing) return;
      if (isProbing) probeHover = pickScenePosition(viewer, movement.endPosition);
      lastMouse = Cartesian2.clone(movement.endPosition, lastMouse ?? new Cartesian2());
      const wait = SAMPLE_MS - (performance.now() - lastSample);
      if (wait <= 0) resample();
      else if (!trailing) trailing = setTimeout(resample, wait);
      if (isProbing) scene.requestRender();
    }, ScreenSpaceEventType.MOUSE_MOVE);

    const onLeave = () => {
      inside = false;
      scene.requestRender();
    };
    canvas.addEventListener("pointerleave", onLeave);

    const scratchWorld = new Cartesian3();
    const scratchStep = new Cartesian3();
    const scratchA = new Cartesian2();
    const scratchB = new Cartesian2();
    const toScreen = (p: Vec3): Cartesian2 | undefined =>
      scene.cartesianToCanvasCoordinates(Cartesian3.fromElements(p.x, p.y, p.z, scratchWorld), new Cartesian2());

    const metresPerPx = (center: Cartesian3): number | null => {
      const a = scene.cartesianToCanvasCoordinates(center, scratchA);
      const b = scene.cartesianToCanvasCoordinates(
        Cartesian3.add(center, viewer.camera.rightWC, scratchStep),
        scratchB
      );
      if (!a || !b) return null;
      const px = Cartesian2.distance(a, b);
      return px > 0 ? 1 / px : null;
    };

    const draw = () => {
      const center = !inside ? null : placing() ? hoverRef.current : probing() ? probeHover : null;
      if (!center) {
        normal = null;
        return hide();
      }
      const eased = easeNormal(normal, target ?? scene.globe.ellipsoid.geodeticSurfaceNormal(center, new Cartesian3()));
      normal = eased.normal;
      const mpp = metresPerPx(center);
      if (!mpp) return hide();

      const g = markGeometry(center, normal, mpp);
      const ring: string[] = [];
      for (const p of g.ring) {
        const s = toScreen(p);
        if (!s) return hide();
        ring.push(`${s.x.toFixed(1)} ${s.y.toFixed(1)}`);
      }
      const c = toScreen(center);
      const start = toScreen(g.stemStart);
      const tip = toScreen(g.stemTip);
      if (!c || !start || !tip) return hide();

      const ringD = `M${ring.join("L")}Z`;
      const stemD = `M${start.x.toFixed(1)} ${start.y.toFixed(1)}L${tip.x.toFixed(1)} ${tip.y.toFixed(1)}`;
      const k = CROSS_PX;
      const crossD = `M${c.x - k} ${c.y - k}L${c.x + k} ${c.y + k}M${c.x - k} ${c.y + k}L${c.x + k} ${c.y - k}`;
      disc.setAttribute("d", ringD);
      for (const layer of layers) {
        layer.ring.setAttribute("d", ringD);
        layer.stem.setAttribute("d", stemD);
        layer.cross.setAttribute("d", crossD);
        layer.dot.setAttribute("cx", tip.x.toFixed(1));
        layer.dot.setAttribute("cy", tip.y.toFixed(1));
      }
      const snapped = placing() && (snapPreviewRef.current != null || nearOriginRef.current);
      setColour(snapped ? SNAP_HALO : CURSOR_INK);
      show();
      if (!eased.settled) scene.requestRender();
    };
    const removePostRender = scene.postRender.addEventListener(draw);

    const unsubscribeActor = actor.subscribe(() => scene.requestRender());
    const unsubscribeStore = store.subscribe((s, prev) => {
      if (s.probing === prev.probing) return;
      if (!s.probing) probeHover = null;
      scene.requestRender();
    });

    return () => {
      removePostRender();
      unsubscribeActor.unsubscribe();
      unsubscribeStore();
      if (trailing) clearTimeout(trailing);
      canvas.removeEventListener("pointerleave", onLeave);
      if (!handler.isDestroyed()) handler.destroy();
      root.remove();
      if (!viewer.isDestroyed()) canvas.style.cursor = "";
    };
  }, [viewerRef, viewerReady, actor, store, refs]);
}
