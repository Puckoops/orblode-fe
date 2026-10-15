"use client";

// ⌘K command palette (enrichment Phase 2) — fuzzy jump to any tool, lens,
// measurement, or preference. Every item runs through EXISTING machinery
// (toolLaunch guards, machine events, store actions) so palette semantics can
// never drift from the toolbar/hotkeys. Portaled to <body> (framer ancestors
// set `transform`, which captures position:fixed — the context-menu lesson).
//
// Keyboard: ⌘K/Ctrl+K (or the person's own key) toggles, registered in
// useViewerHotkeys; hints show the keys in force. ↑/↓ move,
// Enter runs, Esc closes. The list re-ranks per keystroke via the pure scorer
// in lib/viewer/palette.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SearchInput } from "@puckoops/camelot";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

import { rankEntries } from "@/lib/viewer/palette";
import { Key } from "@/components/common/Keycaps";
import { useMacKeys, useShortcuts } from "@/lib/viewer/shortcutPrefs";
import { comboLabel, type ShortcutId } from "@/lib/viewer/shortcuts";
import type { ViewerShellState } from "@/lib/viewer/state/store";
import { useViewerStore } from "@/lib/viewer/state/store";
import {
  allLensesOff,
  cycleContours,
  launchDrawTemplate,
  launchProbe,
  toggleElevationRamp,
  toggleHillshade,
  toggleSnap,
  toggleSunLighting,
  type HotkeyActions,
  type InteractionActor,
} from "@/components/viewer/shell/hooks/toolLaunch";

interface PaletteItem {
  id: string;
  label: string;
  keywords?: string;
  section: "Tools" | "View" | "Measurements" | "Selection" | "Preferences" | "Help";
  /** Bound hotkey shown right-aligned (documentation, not the trigger). */
  hint?: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  actor,
  store,
  actions,
  onShowSheet,
}: {
  open: boolean;
  onClose: () => void;
  actor: InteractionActor;
  store: StoreApi<ViewerShellState>;
  actions: HotkeyActions & { redrawGeometry: () => void };
  onShowSheet: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const measurements = useViewerStore((s) => s.measurements);
  const selection = useViewerStore((s) => s.selection);
  const assistance = useViewerStore((s) => s.drawingAssistance);
  // Store-api reads inside run() callbacks stay fresh; useStore above is only
  // for list/label reactivity while the palette is open.
  useStore(store, (s) => s.snapEnabled);
  const { bindings } = useShortcuts();
  const mac = useMacKeys();

  // Reset per open so it always starts blank — adjusted during render (the
  // repo's FeatureInspector pattern; an effect-setState would cascade renders).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }
  // Focus is a DOM side effect, so it stays in an effect.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    if (!open) return [];
    const s = store.getState();
    const selId = selection?.kind === "measurement" ? selection.measurementIds[0] : null;
    const key = (id: ShortcutId) => {
      const combo = bindings[id];
      return combo ? comboLabel(combo, mac) : undefined;
    };
    const list: PaletteItem[] = [
      { id: "tool-point", label: "Point (elevation)", keywords: "probe sample tool", section: "Tools", hint: key("tool.point"), run: () => launchProbe(actor, store, actions, "palette:point") },
      { id: "tool-probe", label: "Probe", keywords: "identify sample tool", section: "Tools", hint: key("tool.probe"), run: () => launchProbe(actor, store, actions, "palette:probe") },
      { id: "tool-line", label: "Line", keywords: "distance draw tool", section: "Tools", hint: key("tool.line"), run: () => launchDrawTemplate(actor, store, actions, "line") },
      { id: "tool-area", label: "Area (polygon)", keywords: "volume stockpile draw tool", section: "Tools", hint: key("tool.area"), run: () => launchDrawTemplate(actor, store, actions, "polygon") },
      { id: "tool-section", label: "Cross-section", keywords: "profile draw tool", section: "Tools", hint: key("tool.section"), run: () => launchDrawTemplate(actor, store, actions, "section") },
      { id: "tool-slope", label: "Grade / slope", keywords: "gradient draw tool", section: "Tools", hint: key("tool.grade"), run: () => launchDrawTemplate(actor, store, actions, "slope") },
      { id: "tool-snap", label: s.snapEnabled ? "Turn snapping off" : "Turn snapping on", keywords: "snap magnet vertices", section: "Tools", hint: key("draw.snap"), run: () => toggleSnap(store) },
      { id: "cam-north", label: "Reset camera to North", keywords: "compass bearing heading orient 0 degrees", section: "View", hint: key("camera.north"), run: () => actions.resetNorth() },
      { id: "cam-view-mode", label: "Toggle 2D / 3D site", keywords: "flat map plan top-down relief terrain mesh perspective", section: "View", hint: key("camera.dimension"), run: () => actions.toggleViewMode() },
      { id: "view-grid", label: s.gridVisible ? "Hide grid" : "Show grid", keywords: "graticule lines coordinates spacing easting northing", section: "View", hint: key("camera.grid"), run: () => s.setGridVisible(!s.gridVisible) },
      { id: "lens-ramp", label: "Toggle elevation ramp", keywords: "colormap terrain viridis lens height", section: "View", hint: key("lens.ramp"), run: () => toggleElevationRamp(store, actions) },
      { id: "lens-hillshade", label: "Toggle hillshade", keywords: "shading relief lens", section: "View", hint: key("lens.hillshade"), run: () => toggleHillshade(store, actions) },
      { id: "lens-contours", label: "Cycle contour interval", keywords: "isolines lens", section: "View", hint: key("lens.contours"), run: () => cycleContours(store, actions) },
      { id: "lens-sun", label: "Toggle sun lighting", keywords: "shadows daylight lens", section: "View", hint: key("lens.sun"), run: () => toggleSunLighting(store, actions) },
      { id: "lens-off", label: "All lenses off", keywords: "reset view ortho", section: "View", hint: key("lens.off"), run: () => allLensesOff(store, actions) },
      { id: "pref-assist", label: assistance === "assisted" ? "Switch to Precise drawing" : "Switch to Assisted drawing", keywords: "assistance mode defaults auto compute", section: "Preferences", run: () => s.setDrawingAssistance(assistance === "assisted" ? "precise" : "assisted") },
      { id: "help-keys", label: "Keyboard shortcuts", keywords: "help cheat sheet keys", section: "Help", hint: key("help.sheet"), run: () => onShowSheet() },
    ];
    // Selection actions, only when a measurement is selected.
    if (selId) {
      list.push(
        { id: "sel-edit", label: "Edit shape", keywords: "reshape vertices selected", section: "Selection", hint: "↵", run: () => actions.editGeometry() },
        { id: "sel-redraw", label: "Redraw shape", keywords: "trace replace selected", section: "Selection", run: () => actions.redrawGeometry() },
        { id: "sel-frame", label: "Frame selection", keywords: "fly zoom focus", section: "Selection", hint: key("selection.frame"), run: () => s.selectMeasurement(selId, { fly: true }) },
        { id: "sel-vis", label: "Show / hide selection", keywords: "visibility toggle", section: "Selection", hint: key("selection.visible"), run: () => s.toggleMeasurementVisible(selId) }
      );
    }
    // Measurements: select and frame.
    for (const m of measurements) {
      list.push({
        id: `m-${m.id}`,
        label: m.name,
        keywords: `measurement ${m.kind}`,
        section: "Measurements",
        run: () => s.selectMeasurement(m.id, { fly: true }),
      });
    }
    return list;
  }, [open, store, actor, actions, measurements, selection, assistance, onShowSheet, bindings, mac]);

  const ranked = useMemo(() => rankEntries(items, query), [items, query]);
  const clampedCursor = Math.min(cursor, Math.max(0, ranked.length - 1));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // stopImmediatePropagation: capture-phase beats the viewer's bubble-
        // phase Esc (cancel draw) for real key presses, and immediate-stop also
        // covers same-node listener ordering — Esc here ONLY closes the palette.
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const runItem = (item: PaletteItem) => {
    onClose();
    item.run();
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[80] bg-scrim" onPointerDown={onClose} />
      <div
        role="dialog"
        aria-label="Command palette"
        className="fixed top-[18%] left-1/2 z-[81] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-lg border border-hairline bg-surface shadow-[var(--shadow-overlay)]"
      >
        <div className="border-b border-hairline p-2">
          <SearchInput
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, ranked.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const item = ranked[clampedCursor];
                if (item) runItem(item as PaletteItem);
              }
            }}
            placeholder="Jump to a tool, lens, or measurement…"
            aria-label="Search commands"
          />
        </div>
        <div role="listbox" aria-label="Commands" className="max-h-[46vh] overflow-y-auto p-1.5">
          {ranked.length === 0 && <p className="small px-3 py-6 text-center text-ink-4">Nothing matches “{query}”.</p>}
          {ranked.map((item, i) => {
            const it = item as PaletteItem;
            const prev = i > 0 ? (ranked[i - 1] as PaletteItem) : null;
            const showHeader = query.trim() === "" && it.section !== prev?.section;
            return (
              <div key={it.id}>
                {showHeader && <p className="caps px-2.5 pt-2.5 pb-1 text-ink-4">{it.section}</p>}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === clampedCursor}
                  onClick={() => runItem(it)}
                  onMouseEnter={() => setCursor(i)}
                  className={`small flex w-full items-center justify-between gap-3 rounded-xs px-2.5 py-2 text-left ${
                    i === clampedCursor ? "bg-surface-3 text-ink-1" : "text-ink-2"
                  }`}
                >
                  <span className="truncate">{it.label}</span>
                  {it.hint && <Key>{it.hint}</Key>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>,
    document.body
  );
}
