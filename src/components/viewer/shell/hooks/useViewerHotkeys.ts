"use client";

// Viewer hotkeys (enrichment plan §03, Phase 1): single-key mnemonics that make
// the toolbar/panels keyboard-native. Every binding routes into MACHINERY THAT
// ALREADY EXISTS — machine events, viewer actions, view settings — this hook
// adds no interaction logic of its own. The interaction-plane keys (Enter-to-
// commit, Delete, Tab-walk, Alt-suspend) live in useInteractionAdapter; here
// are the GLOBAL keys: tool arming, lenses, framing, the cheat sheet.
//
// Guards: never fires while typing (input/textarea/contenteditable) unless the
// key is the palette's ⌘/Ctrl chord, never on key repeat. Which key runs which
// command comes from the person's bindings (Settings → Keyboard shortcuts);
// Enter stays fixed. Lens keys map only to lenses the SURVEY actually has — a
// missing lens gets a toast, not a silent no-op.

import { useEffect } from "react";
import type { StoreApi } from "zustand/vanilla";

import { currentBindings } from "@/lib/viewer/shortcutPrefs";
import { comboFromEvent, commandFor, isChord } from "@/lib/viewer/shortcuts";
import type { ViewerShellState } from "@/lib/viewer/state/store";
import type { ClaimedKeyEvent } from "./useInteractionAdapter";
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
} from "./toolLaunch";

export type { HotkeyActions } from "./toolLaunch";

export function useViewerHotkeys(
  actor: InteractionActor,
  store: StoreApi<ViewerShellState>,
  actions: HotkeyActions,
  /** Toggle the shortcut cheat-sheet overlay (owned by ViewerCanvas). */
  onToggleSheet: () => void,
  /** Toggle the command palette (owned by ViewerCanvas). */
  onTogglePalette: () => void
): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const combo = comboFromEvent(e);
      if (!combo) return;
      const command = commandFor(currentBindings(), combo);

      // The palette's chord works even while an input has focus (standard
      // palette behavior); every other key leaves typing alone.
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing && !(command === "help.palette" && isChord(combo))) return;

      const s = store.getState();
      const selId = s.selection?.kind === "measurement" ? s.selection.measurementIds[0] : null;

      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Idle + a selected measurement → straight into the edit plane. The
        // adapter owns Enter during editing/calcReady (commit); the CLAIM stamp
        // keeps one keypress from doing both when it runs after us in the same
        // dispatch (listener order is load-dependent).
        if ((e as ClaimedKeyEvent).__orblodeEnterClaimed) return;
        if (actor.getSnapshot().value === "idle" && selId && !s.probing) {
          e.preventDefault();
          (e as ClaimedKeyEvent).__orblodeEnterClaimed = true;
          actions.editGeometry();
        }
        return;
      }

      switch (command) {
        case null:
          return;
        case "tool.point":
          launchProbe(actor, store, actions, "palette:point");
          break;
        case "tool.probe":
          launchProbe(actor, store, actions, "palette:probe");
          break;
        case "tool.line":
          launchDrawTemplate(actor, store, actions, "line");
          break;
        case "tool.area":
          launchDrawTemplate(actor, store, actions, "polygon");
          break;
        case "tool.section":
          launchDrawTemplate(actor, store, actions, "section");
          break;
        case "tool.grade":
          launchDrawTemplate(actor, store, actions, "slope");
          break;
        case "draw.snap":
          toggleSnap(store);
          break;
        case "lens.ramp":
          toggleElevationRamp(store, actions);
          break;
        case "lens.hillshade":
          toggleHillshade(store, actions);
          break;
        case "lens.contours":
          cycleContours(store, actions);
          break;
        case "lens.sun":
          toggleSunLighting(store, actions);
          break;
        case "lens.off":
          allLensesOff(store, actions);
          break;
        case "selection.frame":
          if (!selId) return;
          s.selectMeasurement(selId, { fly: true });
          break;
        case "selection.visible":
          if (!selId) return;
          s.toggleMeasurementVisible(selId);
          break;
        case "camera.north":
          actions.resetNorth();
          break;
        case "camera.dimension":
          actions.toggleViewMode();
          break;
        case "camera.grid":
          s.setGridVisible(!s.gridVisible);
          break;
        case "help.palette":
          onTogglePalette();
          break;
        case "help.sheet":
          onToggleSheet();
          break;
      }
      e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actor, store, actions, onToggleSheet, onTogglePalette]);
}
