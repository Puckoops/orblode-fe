"use client";

// Survey compare — the IN-MODE controls for the swipe comparison: a draggable
// vertical divider over the two epochs' orthos, plus a bottom-center pill with
// the A/B epoch pickers and an exit. It renders ONLY while compare mode is
// active; the FloatingToolbar's Compare tool is the sole entry point (it seeds
// A/B + flips the store), so there is no always-on launcher here. The split
// imagery layers live in useCompareLayers; this owns the divider + pill chrome.

import { useRef } from "react";
import { ArrowLeftRightIcon, Cancel01Icon, DragDropVerticalIcon } from "@hugeicons/core-free-icons";
import { Icon, IconButton, Select } from "@puckoops/camelot";

import { type Survey } from "@/lib/api/orblodeSvc";
import { formatSurveyDate } from "@/lib/utils";
import { useViewerStore } from "@/lib/viewer/state/store";
import { useCompareSurveys } from "@/components/viewer/shell/hooks/useCompareSurveys";
import { PileCompare, SideTag } from "@/components/viewer/shell/PileCompare";

// Clamp the divider to a visible band so the handle never slips fully behind an
// edge (mirrors the hook's inert-when-no-split contract — this is purely UI).
const MIN_SPLIT = 0.05;
const MAX_SPLIT = 0.95;

/** Compact epoch picker: a letter tag + a date-labelled Select. */
function EpochPicker({
  tag,
  value,
  surveys,
  onChange,
}: {
  tag: string;
  value: string | null;
  surveys: Survey[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <SideTag tag={tag} />
      <Select
        variant="filter"
        aria-label={`Survey ${tag}`}
        value={value ?? undefined}
        onValueChange={onChange}
        placeholder="Select survey"
        options={surveys.map((s) => ({ value: s.id, label: formatSurveyDate(s.survey_date) }))}
      />
    </div>
  );
}

export function SurveyCompare({ projectId }: { projectId: string }) {
  const compareActive = useViewerStore((s) => s.compareActive);
  const compareA = useViewerStore((s) => s.compareA);
  const compareB = useViewerStore((s) => s.compareB);
  const splitPosition = useViewerStore((s) => s.splitPosition);
  const setCompareActive = useViewerStore((s) => s.setCompareActive);
  const setCompareA = useViewerStore((s) => s.setCompareA);
  const setCompareB = useViewerStore((s) => s.setCompareB);
  const setSplitPosition = useViewerStore((s) => s.setSplitPosition);

  const { surveys, dateOf } = useCompareSurveys(projectId);

  // Full-canvas measuring wrapper + a plain dragging flag (a ref, not state, so
  // dragging never re-renders — the store's splitPosition drives the UI).
  const canvasRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Nothing here unless compare mode is ON (the toolbar tool turns it on) and
  // the project actually has ≥2 epochs to compare.
  if (!compareActive || !surveys || surveys.length < 2) return null;

  const deactivate = () => setCompareActive(false);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
  };
  const onDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const t = (e.clientX - rect.left) / rect.width;
    setSplitPosition(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, t)));
  };
  const endDrag = (e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const aDate = compareA ? dateOf.get(compareA) : undefined;
  const bDate = compareB ? dateOf.get(compareB) : undefined;

  return (
    <>
      {/* Split divider over the canvas. The wrapper fills the canvas and is
          click-through (pointer-events-none) so the camera stays usable; only
          the thin strip captures the pointer. */}
      <div ref={canvasRef} className="pointer-events-none absolute inset-0 z-20">
        {/* Epoch labels pinned to the top corners (A left, B right, clear of the bell). */}
        {aDate && (
          <span className="num-sm absolute top-3 left-3 rounded-sm border border-hairline bg-surface/90 px-2 py-1 text-ink-1 shadow-[var(--shadow-overlay)] backdrop-blur-md">
            {formatSurveyDate(aDate)}
          </span>
        )}
        {bDate && (
          <span className="num-sm absolute top-3 right-16 rounded-sm border border-hairline bg-surface/90 px-2 py-1 text-ink-1 shadow-[var(--shadow-overlay)] backdrop-blur-md">
            {formatSurveyDate(bDate)}
          </span>
        )}
        {/* Draggable strip: a hairline + a round grab handle. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Compare divider"
          className="pointer-events-auto absolute inset-y-0 flex w-6 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center"
          style={{ left: `${splitPosition * 100}%` }}
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
        >
          <div className="h-full w-px bg-ink-1/70 shadow-[var(--shadow-overlay)]" />
          <div className="absolute flex size-8 items-center justify-center rounded-full border border-hairline-strong bg-surface/90 text-ink-1 shadow-[var(--shadow-overlay)] backdrop-blur-md">
            <Icon icon={DragDropVerticalIcon} size={16} />
          </div>
        </div>
      </div>

      {/* Bottom-center A/B pickers + exit — present only in compare mode. The
          toolbar's Compare tool is what turns the mode on; this is the in-mode
          epoch chooser, not a launcher. Below the pickers, the selected
          stockpile on A against B. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center">
        <div className="pointer-events-auto flex flex-col rounded-lg border border-hairline bg-surface/90 shadow-[var(--shadow-overlay)] backdrop-blur-md">
          <div className="flex items-center gap-2 px-3 py-2">
            <EpochPicker tag="A" value={compareA} surveys={surveys} onChange={setCompareA} />
            <Icon icon={ArrowLeftRightIcon} size={16} className="shrink-0 text-ink-4" />
            <EpochPicker tag="B" value={compareB} surveys={surveys} onChange={setCompareB} />
            <div className="h-5 w-px bg-hairline" />
            <IconButton icon={Cancel01Icon} aria-label="Exit compare" variant="bare" size="sm" onClick={deactivate} />
          </div>
          <PileCompare compareA={compareA} compareB={compareB} dateOf={dateOf} />
        </div>
      </div>
    </>
  );
}
