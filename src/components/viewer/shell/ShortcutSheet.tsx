"use client";

// Keyboard cheat sheet (enrichment §03) — opened with `?` (or the person's own
// key), closed with Esc / click-away / the key again. Shows the keys in force,
// which Settings → Keyboard shortcuts can change. Also hosts the layer-3
// "Drawing assistance" preference: a DEFAULTS switch (snap default +
// auto-compute), never a behavior fork.

import { Dialog, SegmentedControl, TextLink } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";

import { Keys } from "@/components/common/Keycaps";
import { useMacKeys, useShortcuts } from "@/lib/viewer/shortcutPrefs";
import { FIXED_KEYS, SHORTCUT_GROUPS, SHORTCUTS } from "@/lib/viewer/shortcuts";
import { useViewerStore, type ViewerShellState } from "@/lib/viewer/state/store";

function Row({ keys, children }: { keys: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="flex w-[112px] flex-none flex-wrap gap-1">{keys}</span>
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
  const { bindings } = useShortcuts();
  const mac = useMacKeys();

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
        {SHORTCUT_GROUPS.map((group) => (
          <Group key={group} title={group}>
            {SHORTCUTS.filter((c) => c.group === group).map((c) => {
              const combo = bindings[c.id];
              return (
                <Row key={c.id} keys={<Keys combos={combo ? [combo] : []} mac={mac} />}>
                  {c.label}
                </Row>
              );
            })}
            {FIXED_KEYS.filter((f) => f.group === group).map((f) => (
              <Row key={f.label} keys={<Keys combos={f.keys} mac={mac} />}>
                {f.label}
              </Row>
            ))}
          </Group>
        ))}
      </div>

      <p className="caption mt-5 text-ink-4">
        Set your own keys in{" "}
        <TextLink as={Link} href="/settings?tab=shortcuts" target="_blank" rel="noopener">
          Settings
        </TextLink>
        . They apply in this browser.
      </p>

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
