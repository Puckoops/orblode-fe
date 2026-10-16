"use client";

import { Cancel01Icon, CenterFocusIcon, Delete02Icon, Layers01Icon } from "@hugeicons/core-free-icons";
import { Button, Dropzone, IconButton, Switch } from "@puckoops/camelot";
import { useRef, useState, type DragEvent } from "react";
import { INSTA_VIEW_ACCEPT, checkOverlayFile, extensionOf, type InstaOverlay, type OverlayFocus } from "@/lib/dashboard/instaView";
import { toast } from "@/lib/toast";

/** The files open in Insta View, shared by its panel and the globe that draws them. */
export function useInstaView() {
  const [overlays, setOverlays] = useState<InstaOverlay[]>([]);
  const [focus, setFocus] = useState<OverlayFocus | null>(null);
  const [open, setOpen] = useState(false);
  const nextId = useRef(0);
  const nextFocus = useRef(0);

  const add = (files: File[]) => {
    const accepted: InstaOverlay[] = [];
    for (const file of files) {
      const check = checkOverlayFile(file);
      if ("error" in check) toast.error(check.error);
      else accepted.push({ id: `overlay-${++nextId.current}`, file, format: check.format, visible: true, loaded: false });
    }
    if (accepted.length === 0) return;
    setOverlays((prev) => [...prev, ...accepted]);
    setOpen(true);
  };

  const patch = (id: string, change: Partial<InstaOverlay>) =>
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...change } : o)));

  const remove = (id: string) => setOverlays((prev) => prev.filter((o) => o.id !== id));

  // Without these a file dropped outside the panel makes the browser open it in place of the app.
  // The panel's Dropzone has already taken a drop it prevented, so that one is skipped here.
  const dropTarget = {
    onDragOver: (e: DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDrop: (e: DragEvent) => {
      if (e.defaultPrevented || !e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      add(Array.from(e.dataTransfer.files));
    },
  };

  return {
    overlays,
    focus,
    open,
    setOpen,
    add,
    dropTarget,
    setVisible: (id: string, visible: boolean) => patch(id, { visible }),
    remove,
    focusOn: (id: string) => setFocus({ id, seq: ++nextFocus.current }),
    loaded: (overlay: InstaOverlay, entities: number, skippedParts: boolean) => {
      patch(overlay.id, { loaded: true });
      if (entities === 0) toast.info(`${overlay.file.name} opened but has nothing to draw.`);
      else if (skippedParts) toast.info(`Some parts of ${overlay.file.name} can't be shown on the globe.`);
    },
    failed: (overlay: InstaOverlay, message: string) => {
      toast.error(message);
      remove(overlay.id);
    },
  };
}

export type InstaViewState = ReturnType<typeof useInstaView>;

export function InstaView({ insta }: { insta: InstaViewState }) {
  const { overlays, open, setOpen } = insta;

  return (
    <div className="absolute top-4 left-4 z-10 flex w-80 flex-col items-start gap-2">
      <Button
        variant="quiet"
        size="sm"
        iconStart={Layers01Icon}
        aria-expanded={open}
        className="shadow-[var(--shadow-overlay)]"
        onClick={() => setOpen(!open)}
      >
        {overlays.length > 0 ? `Insta View · ${overlays.length}` : "Insta View"}
      </Button>

      {open && (
        <section aria-label="Insta View" className="w-full rounded-lg border border-hairline bg-surface p-4 shadow-[var(--shadow-overlay)]">
          <div className="mb-1 flex items-start justify-between gap-3">
            <h2 className="h3">Insta View</h2>
            <IconButton icon={Cancel01Icon} aria-label="Close Insta View" variant="bare" size="sm" onClick={() => setOpen(false)} />
          </div>
          <p className="caption text-ink-3 mb-4">Files open on this device only. Nothing is uploaded, and they are gone when you leave the page.</p>

          <Dropzone onFiles={insta.add} accept={INSTA_VIEW_ACCEPT} hint="KML, KMZ, GeoJSON, CZML or GPX, up to 50 MB" />

          {overlays.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1">
              {overlays.map((o) => {
                const name = o.file.name;
                return (
                  <li key={o.id} className="flex items-center gap-2">
                    <Switch size="sm" checked={o.visible} onCheckedChange={(v) => insta.setVisible(o.id, v)} aria-label={`Show ${name}`} />
                    <span className="body min-w-0 flex-1 truncate" title={name}>
                      {name}
                    </span>
                    <span className="caption text-ink-3 shrink-0">{o.loaded ? extensionOf(name).toUpperCase() : "Opening…"}</span>
                    <IconButton
                      icon={CenterFocusIcon}
                      aria-label={`Zoom to ${name}`}
                      variant="bare"
                      size="sm"
                      disabled={!o.loaded}
                      onClick={() => insta.focusOn(o.id)}
                    />
                    <IconButton icon={Delete02Icon} aria-label={`Remove ${name}`} variant="bare" size="sm" onClick={() => insta.remove(o.id)} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
