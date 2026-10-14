"use client";

// CameraJoystick — the single floating camera control (orbit + compass +
// orientation, FR-03 / FR-05).
//
// The compass and the orientation widget used to live in a separate
// OrientationGizmo in the opposite corner. They are folded in here because they
// are one control, not three: you DRAG to change heading, the ring SHOWS the
// heading you landed on, and you CLICK north to snap back. Splitting the readout
// from the input put the answer and the question in different corners.
//
// Two concentric zones, outside in:
//
//   ┌ compass rose ─ N/E/S/W marks placed at their true projected screen
//   │                direction. Surveyors read a site in cardinal directions,
//   │                so the widget answers "which way is North right now?"
//   │                directly instead of showing an X/Y/Z triad the reader has
//   │                to map onto the ground first. The whole ring is also the
//   │                FR-03 reset button.
//   └ joystick ───── the drag disc, unchanged in behaviour: push to orbit
//                    heading, tilt with up/down.
//
// Hit-testing separates cleanly because the ring button and the drag disc are
// SIBLINGS, not nested: a pointer in the annulus reaches the button, a pointer
// on the disc is caught by the disc, and neither bubbles into the other.
//
// The whole assembly auto-fades on camera idle (useCameraOrientation); the
// button stack below deliberately does NOT, so the zoom and home controls stay
// legible while the scene is quiet.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Cartesian3,
  Math as CesiumMath,
  Matrix4,
  Transforms,
  type Viewer as CesiumViewer,
} from "cesium";
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  GridIcon,
  GridOffIcon,
  Home01Icon,
  Maximize01Icon,
  Minimize01Icon,
  MinusSignIcon,
  Orbit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { Icon, IconButton } from "@puckoops/camelot";

import { screenCenterPivot } from "@/lib/viewer/camera";
import {
  GIZMO_FADE_MS,
  cardinalMarksByDepth,
  type ViewMode,
} from "@/lib/viewer/cameraControls";
import { useCameraOrientation } from "@/components/viewer/shell/hooks/useCameraOrientation";
import { useMacKeys, useShortcuts } from "@/lib/viewer/shortcutPrefs";
import { comboLabel } from "@/lib/viewer/shortcuts";

/** Geometry of the concentric control, in px. Named rather than inlined so the
 * zones stay in a provable relationship, which the invariants below assert: the
 * cardinal marks must clear the joystick disc without leaving the ring, and the
 * knob must never cross the disc rim.
 *
 * The widget is larger than either of the two it replaces, but it replaces BOTH
 * and frees the opposite corner entirely, so the HUD's total footprint drops. */
const DIAL = {
  /** Overall widget box — also the compass button's hit area. */
  size: 104,
  /** The guide ring the cardinal marks sit on. */
  ringR: 40,
  /** Radius of the joystick drag disc. 56px across — clear of the 44px minimum
   * touch target. */
  discR: 28,
  /** Cardinal mark disc. */
  markR: 8,
  /** Knob travel from disc centre. Kept inside `discR - knobR` so the knob
   * never clips the rim at full deflection. */
  knobTravel: 15,
  /** Knob radius. */
  knobR: 11,
} as const;

// Composition invariants, checked once at module load in development. They are
// the reason the numbers above can be tuned safely: a change that lets a mark
// slide under the disc, off the widget, or the knob escape its rim fails loudly
// here instead of silently producing an unreadable dial.
if (process.env.NODE_ENV !== "production") {
  console.assert(
    DIAL.ringR - DIAL.markR >= DIAL.discR,
    "CameraJoystick: cardinal marks must clear the joystick disc"
  );
  console.assert(
    DIAL.ringR + DIAL.markR <= DIAL.size / 2,
    "CameraJoystick: cardinal marks must stay inside the widget box"
  );
  console.assert(
    DIAL.knobTravel + DIAL.knobR <= DIAL.discR,
    "CameraJoystick: the knob must not cross the disc rim at full deflection"
  );
}

/**
 * Brightness for a compass mark, from its along-view component.
 *
 * This is the widget's tilt cue. Looking straight down, all four marks are
 * equidistant (`depth` 0) and read equally bright; as the camera tilts, the
 * point it faces recedes and dims while the one behind the pivot comes forward.
 * So the rose tells you which way you are LEANING as well as which way is north,
 * without needing a second indicator.
 */
function markOpacity(depth: number): number {
  // depth ∈ [-1, 1]; map to a readable band rather than fading to invisible.
  return 0.45 + 0.55 * ((1 - depth) / 2);
}

/** Camelot tokens, as SVG paints. The three non-north marks stay muted so North reads as the
 * reference point at a glance rather than competing with its own siblings. */
const COLOR = {
  ring: "var(--hairline)",
  north: "var(--emphasis)",
  northText: "var(--emphasis-on)",
  mark: "var(--surface-3)",
  markText: "var(--text-3)",
} as const;

// Angular speed at full knob deflection (radians / second). Scaled by the
// normalized deflection and the frame delta so the orbit feels frame-rate
// independent and eases in from the center.
const YAW_RATE = 1.3; // horizontal orbit (heading)
const PITCH_RATE = 1.1; // vertical orbit (tilt)

// Pitch is clamped to a useful band: just shy of straight-down (top-down survey
// view) to a low oblique, never crossing the horizon (which would put the
// camera underground) or going fully vertical (gimbal flip).
const MIN_PITCH = CesiumMath.toRadians(-89);
const MAX_PITCH = CesiumMath.toRadians(-8);

interface CameraJoystickProps {
  /** Ref to the live Cesium viewer, owned by the parent. */
  viewerRef: React.RefObject<CesiumViewer | null>;
  /** Becomes true once the viewer is mounted and safe to drive. */
  ready: boolean;
  /** Reset the camera to the survey's first framing. */
  onHome?: () => void;
  /** Step the camera forward/backward along its view vector. */
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  /** Current fullscreen state, so the button shows the right icon. */
  isFullscreen?: boolean;
  /** Toggle fullscreen on the viewer shell. */
  onToggleFullscreen?: () => void;
  /** FR-06 — 2D keeps the camera straight down, so the joystick only turns it. */
  viewMode?: ViewMode;
  onToggleViewMode?: () => void;
  /** FR-03 — ease the camera bearing to 0.0° True North. Wired to the ring. */
  onResetNorth?: () => void;
  gridVisible?: boolean;
  onToggleGrid?: () => void;
}

/**
 * The compass rose: N / E / S / W placed at their true projected screen
 * direction, on a faint guide ring.
 *
 * Marks sit at a FIXED radius rather than at their foreshortened distance —
 * the centre of the widget is the joystick disc, so a truly projected mark
 * would slide underneath it the moment the camera tilted. The exact screen
 * ANGLE is preserved (which is the reading that matters), and the radial
 * foreshortening it drops comes back as brightness through `markOpacity`.
 *
 * Drawn back-to-front so a near mark overlaps a far one.
 */
function CompassRose({ heading, pitch }: { heading: number; pitch: number }) {
  const c = DIAL.size / 2;
  return (
    <>
      <circle cx={c} cy={c} r={DIAL.ringR} fill="none" stroke={COLOR.ring} strokeWidth={1} />
      {cardinalMarksByDepth(heading, pitch).map((m) => {
        const x = c + m.x * DIAL.ringR;
        const y = c + m.y * DIAL.ringR;
        // North is the reference every other reading hangs off, so it keeps the
        // emphasis while the rest stay muted.
        const isNorth = m.label === "N";
        return (
          <g key={m.label} opacity={markOpacity(m.depth)}>
            <circle
              cx={x}
              cy={y}
              r={DIAL.markR}
              fill={isNorth ? COLOR.north : COLOR.mark}
              stroke={isNorth ? "none" : COLOR.ring}
              strokeWidth={1}
            />
            {/* Letters are positioned, never rotated — a compass whose labels
                spin with the bearing is a compass you cannot read. */}
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              className="caps"
              fill={isNorth ? COLOR.northText : COLOR.markText}
            >
              {m.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

/**
 * Hold-and-drag joystick that orbits the viewer camera around the point at the
 * center of the screen, wrapped in a compass ring that reports the resulting
 * bearing and resets it. Push left/right to swing the heading, push up to tilt
 * toward the horizon (oblique 3D), push down to return toward top-down. Works
 * with mouse, touch and pen via pointer capture.
 */
export function CameraJoystick({
  viewerRef,
  ready,
  onHome,
  onZoomIn,
  onZoomOut,
  isFullscreen,
  onToggleFullscreen,
  viewMode = "3d",
  onToggleViewMode,
  onResetNorth,
  gridVisible = false,
  onToggleGrid,
}: CameraJoystickProps) {
  const [active, setActive] = useState(false);
  const viewModeCombo = useShortcuts().bindings["camera.dimension"];
  const mac = useMacKeys();
  const viewModeKey = viewModeCombo ? ` (${comboLabel(viewModeCombo, mac)})` : "";
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const baseRef = useRef<HTMLDivElement>(null);
  // Normalized deflection [-1, 1] read by the animation loop; a ref so updating
  // it during a drag doesn't re-render every frame.
  const deflectRef = useRef({ x: 0, y: 0 });
  // Orbit pivot stays fixed for the duration of a single drag for a stable swing.
  const pivotRef = useRef<Cartesian3 | null>(null);

  const { heading, pitch, hudRef, wake } = useCameraOrientation(viewerRef, ready);

  // While the joystick is held (active), run a rAF loop that orbits the camera
  // by the current deflection each frame. Releasing flips `active` off and the
  // effect cleanup cancels the loop.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = 0;

    function frame(ts: number) {
      const v = viewerRef.current;
      if (!v || v.isDestroyed()) return;

      // Clamp dt so a backgrounded tab doesn't snap the camera on resume.
      const dt = Math.min((ts - (last || ts)) / 1000, 0.05);
      last = ts;

      const { x, y } = deflectRef.current;
      if (x !== 0 || y !== 0) {
        const { scene } = v;
        const camera = scene.camera;
        const pivot = (pivotRef.current ??= screenCenterPivot(v));

        // Operate in the pivot's east-north-up frame so rotateRight/rotateUp
        // orbit around it instead of around the globe center; release the
        // frame afterwards so Cesium's own controls keep working.
        camera.lookAtTransform(Transforms.eastNorthUpToFixedFrame(pivot));

        if (x !== 0) camera.rotateRight(x * YAW_RATE * dt);

        if (y !== 0 && viewMode === "3d") {
          // Knob up (y < 0) eases toward the horizon; down returns top-down.
          const prevPitch = camera.pitch;
          const delta = y * PITCH_RATE * dt;
          camera.rotateUp(delta);
          // Reject only moves that push pitch further outside the band, so a
          // view starting dead top-down can still tilt back into range.
          const p = camera.pitch;
          const worse =
            (p < MIN_PITCH && p < prevPitch) || (p > MAX_PITCH && p > prevPitch);
          if (worse) camera.rotateUp(-delta);
        }

        camera.lookAtTransform(Matrix4.IDENTITY);
        scene.requestRender();
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, viewerRef, viewMode]);

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > DIAL.knobTravel) {
      dx = (dx / dist) * DIAL.knobTravel;
      dy = (dy / dist) * DIAL.knobTravel;
    }
    setKnob({ x: dx, y: dy });
    deflectRef.current = { x: dx / DIAL.knobTravel, y: dy / DIAL.knobTravel };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      // A held joystick must not dim out from under the hand driving it.
      wake();
      setActive(true);
      updateFromPointer(e.clientX, e.clientY);
    },
    [updateFromPointer, wake]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!active) return;
      updateFromPointer(e.clientX, e.clientY);
    },
    [active, updateFromPointer]
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setActive(false); // effect cleanup cancels the rAF loop
    setKnob({ x: 0, y: 0 });
    deflectRef.current = { x: 0, y: 0 };
    pivotRef.current = null;
  }, []);

  if (!ready) return null;

  const dx = knob.x / DIAL.knobTravel;
  const dy = knob.y / DIAL.knobTravel;
  const discInset = (DIAL.size - DIAL.discR * 2) / 2;

  const hudButton = "size-6 rounded-full border-hairline bg-surface/90 backdrop-blur-xl";
  const hint = (on: boolean) => `pointer-events-none absolute ${on ? "text-ink-1" : "text-ink-4"}`;

  return (
    <div className="absolute top-6 left-6 z-10 flex flex-col items-center gap-2 select-none">
      {/* Compass rose + joystick — one fading unit (FR-05). */}
      <div
        ref={hudRef}
        className="relative"
        style={{
          width: DIAL.size,
          height: DIAL.size,
          transition: `opacity ${GIZMO_FADE_MS}ms ease-in-out`,
        }}
      >
        {/* Compass ring — the FR-03 reset target. A sibling of the drag disc,
            so a pointer landing on the disc never reaches this button. */}
        <button
          type="button"
          onClick={onResetNorth}
          disabled={!onResetNorth}
          aria-label={`Reset camera to North. Currently facing ${Math.round(heading)} degrees.`}
          title="Reset to North"
          className={`absolute inset-0 rounded-full border bg-surface/90 shadow-[var(--shadow-overlay)] backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
            active ? "border-hairline-strong" : "border-hairline"
          }`}
        >
          <svg width={DIAL.size} height={DIAL.size} viewBox={`0 0 ${DIAL.size} ${DIAL.size}`} aria-hidden="true">
            <CompassRose heading={heading} pitch={pitch} />
          </svg>
        </button>

        {/* Joystick disc — a sibling of the ring button, painted after it so it
            sits on top and owns pointer events over its own area. */}
        <div
          ref={baseRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="application"
          aria-label="Hold and drag to change the camera angle"
          title="Hold and drag to change the camera angle"
          className={`absolute touch-none rounded-full border bg-surface ${
            active ? "cursor-grabbing border-hairline-strong" : "cursor-grab border-hairline hover:border-hairline-strong"
          }`}
          style={{ inset: discInset }}
        >
          {/* Crosshair guides */}
          <div className="pointer-events-none absolute top-2.5 bottom-2.5 left-1/2 w-px -translate-x-1/2 bg-hairline" />
          <div className="pointer-events-none absolute top-1/2 right-2.5 left-2.5 h-px -translate-y-1/2 bg-hairline" />

          {/* Directional hints — brighten toward the side being pushed */}
          {viewMode === "3d" && (
            <>
              <Icon icon={ArrowUp01Icon} size={16} className={`${hint(dy < -0.2)} -top-1 left-1/2 -translate-x-1/2`} />
              <Icon icon={ArrowDown01Icon} size={16} className={`${hint(dy > 0.15)} -bottom-1 left-1/2 -translate-x-1/2`} />
            </>
          )}
          <Icon icon={ArrowLeft01Icon} size={16} className={`${hint(dx < -0.15)} top-1/2 -left-1 -translate-y-1/2`} />
          <Icon icon={ArrowRight01Icon} size={16} className={`${hint(dx > 0.15)} top-1/2 -right-1 -translate-y-1/2`} />

          {/* Knob */}
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 flex items-center justify-center rounded-full border border-hairline-strong bg-emphasis text-emphasis-on shadow-[var(--shadow-raised)]"
            style={{
              width: DIAL.knobR * 2,
              height: DIAL.knobR * 2,
              transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px)) scale(${active ? 1.08 : 1})`,
              transition: active ? "none" : "transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <Icon icon={Orbit01Icon} size={16} />
          </div>
        </div>
      </div>

      {onToggleGrid && (
        <IconButton
          icon={gridVisible ? GridIcon : GridOffIcon}
          size="sm"
          onClick={onToggleGrid}
          aria-label={gridVisible ? "Hide the grid" : "Show the grid"}
          aria-pressed={gridVisible}
          title={gridVisible ? "Hide grid (Shift+G)" : "Show grid (Shift+G)"}
          className={hudButton}
        />
      )}

      {/* Labelled with the view it switches to, as map apps do. */}
      {onToggleViewMode && (
        <button
          type="button"
          onClick={onToggleViewMode}
          aria-label={viewMode === "2d" ? "Show the site in 3D" : "Show the site flat, in 2D"}
          title={`${viewMode === "2d" ? "3D site" : "2D flat site"}${viewModeKey}`}
          className="caps flex size-6 items-center justify-center rounded-full border border-hairline bg-surface/90 tracking-normal text-ink-3 backdrop-blur-xl hover:bg-surface-2 hover:text-ink-1 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        >
          {viewMode === "2d" ? "3D" : "2D"}
        </button>
      )}

      {onHome && (
        <IconButton icon={Home01Icon} size="sm" onClick={onHome} aria-label="Reset camera to home view" title="Reset camera to home view" className={hudButton} />
      )}

      {(onZoomIn || onZoomOut) && (
        <div className="flex w-6 flex-col overflow-hidden rounded-full border border-hairline bg-surface/90 backdrop-blur-xl">
          {onZoomIn && (
            <IconButton icon={PlusSignIcon} size="sm" variant="bare" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in" className="size-6 rounded-none" />
          )}
          {onZoomIn && onZoomOut && <div className="h-px w-full bg-hairline" />}
          {onZoomOut && (
            <IconButton icon={MinusSignIcon} size="sm" variant="bare" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out" className="size-6 rounded-none" />
          )}
        </div>
      )}

      {onToggleFullscreen && (
        <IconButton
          icon={isFullscreen ? Minimize01Icon : Maximize01Icon}
          size="sm"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className={hudButton}
        />
      )}
    </div>
  );
}
