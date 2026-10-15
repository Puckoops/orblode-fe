"use client";

// Right-click context menu for a measurement in the 3D scene (P2c-2). Opened by
// useScenePicking's RIGHT_CLICK (which also selects the target), positioned at
// the cursor. Edit / Redraw act on the current selection (just set); Delete
// targets the stored id. Closes on action, Esc, or a click-away.

import { createPortal } from "react-dom";
import { Delete02Icon, PenLineIcon, PinIcon, PinOffIcon, SplineIcon } from "@hugeicons/core-free-icons";
import { Menu, MenuItem } from "@puckoops/camelot";

import { useViewerStore } from "@/lib/viewer/state/store";
import { useViewerActions } from "@/components/viewer/shell/viewerActions";
import { useMayMeasure } from "@/components/viewer/shell/hooks/useMayMeasure";
import { useConfirm } from "@/components/common/confirm";
import { measurementDeleteRequest } from "@/components/viewer/deleteConfirm";

const MENU_WIDTH = 208;

export function MeasurementContextMenu() {
  const contextMenu = useViewerStore((s) => s.contextMenu);
  const measurements = useViewerStore((s) => s.measurements);
  const closeContextMenu = useViewerStore((s) => s.closeContextMenu);
  const selectMeasurement = useViewerStore((s) => s.selectMeasurement);
  const actions = useViewerActions();
  const mayMeasure = useMayMeasure();
  // ORB-37. The dialog is owned here but rendered as a SIBLING of the menu:
  // `run()` closes the menu synchronously, so a dialog nested inside the menu
  // markup would unmount before it could be answered.
  const { confirm, confirmDialog } = useConfirm();

  if (typeof document === "undefined") return null;

  const measurement = contextMenu ? (measurements.find((m) => m.id === contextMenu.measurementId) ?? null) : null;

  let menu: React.ReactNode = null;
  if (contextMenu && measurement && mayMeasure) {
    const geomType = measurement.geometry?.type;
    const editable = geomType === "Polygon" || geomType === "LineString";
    const pinnable = measurement.kind === "stockpile" && !measurement.draft && !!measurement.geometry;

    // Selection-dependent actions (Edit / Redraw read the current selection); make
    // the menu self-consistent by re-selecting its target first, regardless of how
    // it was opened.
    const run = (fn: () => void) => {
      closeContextMenu();
      selectMeasurement(measurement.id, { fly: false });
      fn();
    };

    // A zero-size anchor at the cursor is the menu's trigger, so Camelot's Menu positions, flips at
    // the viewport edge, and closes on Esc or a click away.
    menu = (
      <Menu
        open
        onOpenChange={(open) => !open && closeContextMenu()}
        align="start"
        side="bottom"
        minWidth={MENU_WIDTH}
        trigger={<span aria-label={`Actions for ${measurement.name}`} className="pointer-events-none fixed size-0" style={{ left: contextMenu.x, top: contextMenu.y }} />}
      >
        {editable && (
          <MenuItem icon={SplineIcon} onSelect={() => run(actions.editGeometry)}>
            Edit shape
          </MenuItem>
        )}
        {editable && (
          <MenuItem icon={PenLineIcon} onSelect={() => run(actions.redrawGeometry)}>
            Redraw
          </MenuItem>
        )}
        {pinnable && (
          <MenuItem icon={measurement.pinned ? PinOffIcon : PinIcon} onSelect={() => run(() => void actions.pinPile(measurement.id, !measurement.pinned))}>
            {measurement.pinned ? "Unpin from every survey" : "Pin to every survey"}
          </MenuItem>
        )}
        <MenuItem
          icon={Delete02Icon}
          onSelect={() =>
            run(() =>
              confirm(
                measurementDeleteRequest({ name: measurement.name, draft: measurement.draft }, () => actions.removeMeasurement(measurement.id))
              )
            )
          }
        >
          Delete
        </MenuItem>
      </Menu>
    );
  }

  // Portaled to <body> so `position: fixed` is viewport-relative (the shell's
  // framer-motion ancestors set `transform`, which would otherwise capture it).
  return createPortal(
    <>
      {menu}
      {confirmDialog}
    </>,
    document.body
  );
}
