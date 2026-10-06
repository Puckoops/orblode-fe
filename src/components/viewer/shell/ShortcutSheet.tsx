"use client";

// Keyboard cheat sheet (enrichment §03) — opened with `?`, closed with Esc /
// click-away / `?` again. Also hosts the layer-3 "Drawing assistance"
// preference: a DEFAULTS switch (snap default + auto-compute), never a behavior fork.

import { Dialog, SegmentedControl } from "@puckoops/camelot";
import { useEffect, type ReactNode } from "react";

import { useViewerStore, type ViewerShellState } from "@/lib/viewer/state/store";

export function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="num-sm inline-block rounded-xs border border-b-2 border-hairline-strong bg-surface-3 px-1.5 py-0.5 font-medium text-ink-1">
      {children}
    </kbd>
  );
}

function Row({ keys, children }: { keys: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="flex w-[102px] flex-none flex-wrap gap-1">{keys}</span>
      <span className="small text-ink-3">{children}</span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="caps mb-1.5 text-ink-2">{title}</p>
      {children}
    </div>
  );
}

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const assistance = useViewerStore((s) => s.drawingAssistance);
  const setDrawingAssistance = useViewerStore((s) => s.setDrawingAssistance);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // Front-most surface owns Esc: never let it fall through to the
        // viewer's cancel-draw listener (window capture + immediate stop).
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} title="Keyboard shortcuts" width={680}>
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        <Group title="Tools">
          <Row keys={<><Key>P</Key><Key>I</Key></>}>Point · elevation probe</Row>
          <Row keys={<><Key>L</Key><Key>A</Key></>}>Line · Area (polygon)</Row>
          <Row keys={<><Key>X</Key><Key>G</Key></>}>Cross-section · Grade</Row>
          <Row keys={<Key>Esc</Key>}>Discard / back to cursor</Row>
        </Group>

        <Group title="Drawing & editing">
          <Row keys={<Key>Enter</Key>}>Finish — or edit the selected shape</Row>
          <Row keys={<><Key>S</Key> <Key>Alt</Key></>}>Snap toggle · hold to suspend</Row>
          <Row keys={<><Key>Tab</Key><Key>←</Key><Key>→</Key></>}>Walk vertices while editing</Row>
          <Row keys={<Key>Del</Key>}>Remove the selected vertex</Row>
        </Group>

        <Group title="Lenses">
          <Row keys={<><Key>1</Key><Key>2</Key></>}>Elevation ramp · hillshade</Row>
          <Row keys={<><Key>3</Key><Key>4</Key></>}>Contours (cycles interval) · sun</Row>
          <Row keys={<Key>0</Key>}>All lenses off</Row>
        </Group>

        <Group title="Scene">
          <Row keys={<Key>F</Key>}>Frame the selected measurement</Row>
          <Row keys={<Key>V</Key>}>Show / hide the selection</Row>
          <Row keys={<Key>?</Key>}>This sheet</Row>
        </Group>

        <Group title="Camera">
          <Row keys={<Key>N</Key>}>Reset bearing to North</Row>
          <Row keys={<Key>O</Key>}>2D top-down · 3D perspective</Row>
        </Group>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-surface-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="small font-medium text-ink-1">Drawing assistance</p>
          <p className="caption text-ink-4">
            Defaults only — gestures never change. Assisted: snap on, compute on finish. Precise: snap off, you run compute.
          </p>
        </div>
        <SegmentedControl<ViewerShellState["drawingAssistance"]>
          aria-label="Drawing assistance"
          size="sm"
          value={assistance}
          onValueChange={setDrawingAssistance}
          options={[
            { value: "assisted", label: "Assisted" },
            { value: "precise", label: "Precise" },
          ]}
        />
      </div>
    </Dialog>
  );
}
