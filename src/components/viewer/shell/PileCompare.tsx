"use client";

// The current survey's side is the live selected row, so a recompute shows
// straight away; the other surveys' stockpiles are fetched.

import { Skeleton } from "@puckoops/camelot";

import type { Measurement } from "@/lib/api/orblodeSvc";
import { formatPercent, formatValue } from "@/lib/reports";
import { pileState } from "@/lib/status";
import { formatSurveyDate } from "@/lib/utils";
import { metricsOf, resultForKind } from "@/lib/viewer/calc";
import { findPile, isSavedStockpile, pileDiff, pileIdOf, pileStateOf } from "@/lib/viewer/compare";
import { useViewerStore } from "@/lib/viewer/state/store";
import { convertForDisplay, unitSystemOf, type UnitSystem } from "@/lib/viewer/units";
import { StateChip } from "@/components/common/StateChip";
import { useSurveyStockpiles, type SurveyStockpiles } from "@/components/viewer/shell/hooks/useSurveyStockpiles";

type Side = Measurement | null | "loading" | "failed";

export function SideTag({ tag }: { tag: string }) {
  return (
    <span className="caps flex size-5 shrink-0 items-center justify-center rounded-xs bg-surface-3 text-ink-1">{tag}</span>
  );
}

function formatAmount(key: string, value: number, system: UnitSystem, signed = false): string {
  const sign = !signed ? "" : value > 0 ? "+" : value < 0 ? "−" : "±";
  const abs = signed ? Math.abs(value) : value;
  if (key === "value") return `${sign}${formatValue(abs)}`;
  const c = convertForDisplay(key, abs, system);
  const digits = c.value !== 0 && Math.abs(c.value) < 10 ? 1 : 0;
  return `${sign}${c.value.toLocaleString(undefined, { maximumFractionDigits: digits })}${c.unit ? ` ${c.unit}` : ""}`;
}

function sideOf(id: string, surveyId: string, selected: Measurement, list: SurveyStockpiles): Side {
  if (id === surveyId) return selected;
  if (list === "loading" || list === "failed") return list;
  return findPile(list, pileIdOf(selected));
}

function SideNote({ tag, side, date }: { tag: string; side: Side; date: string | undefined }) {
  let note: React.ReactNode = null;
  if (side === "failed") note = <span className="caption text-ink-3">Couldn’t load this survey’s stockpiles</span>;
  else if (side === null) note = <span className="caption text-ink-3">No matching pile on {date ? formatSurveyDate(date) : "this survey"}</span>;
  else if (side !== "loading" && pileStateOf(side) !== "computed") note = <StateChip state={pileState(pileStateOf(side))} />;
  if (!note) return null;
  return (
    <div className="flex items-center gap-2">
      <SideTag tag={tag} />
      {note}
    </div>
  );
}

function PileDiff({
  selected,
  surveyId,
  aId,
  bId,
  dateOf,
}: {
  selected: Measurement;
  surveyId: string;
  aId: string;
  bId: string;
  dateOf: Map<string, string>;
}) {
  const aList = useSurveyStockpiles(aId === surveyId ? null : aId);
  const bList = useSurveyStockpiles(bId === surveyId ? null : bId);
  const a = sideOf(aId, surveyId, selected, aList);
  const b = sideOf(bId, surveyId, selected, bList);

  if (a === "loading" || b === "loading") return <Skeleton width="100%" height={88} />;

  const metrics = (side: Side) => (typeof side === "object" && side ? metricsOf(resultForKind(side)) : null);
  const rows = pileDiff(metrics(a), metrics(b));
  const system = unitSystemOf(selected.params);

  return (
    <>
      {rows.length > 0 && (
        <div className="grid grid-cols-[auto_auto_auto_auto] items-center gap-x-5 gap-y-1">
          <span />
          <span className="justify-self-end">
            <SideTag tag="A" />
          </span>
          <span className="justify-self-end">
            <SideTag tag="B" />
          </span>
          <span className="caps justify-self-end text-ink-4">Change</span>
          {rows.map((r) => (
            <div key={r.key} className="contents">
              <span className="caption text-ink-3">{r.label}</span>
              <span className="num-sm justify-self-end text-ink-2">{r.a === null ? "—" : formatAmount(r.key, r.a, system)}</span>
              <span className="num-sm justify-self-end text-ink-1">{r.b === null ? "—" : formatAmount(r.key, r.b, system)}</span>
              <span
                className={`num-sm justify-self-end whitespace-nowrap ${
                  r.delta === null || r.delta === 0 ? "text-ink-2" : r.delta > 0 ? "text-delta-up" : "text-delta-down"
                }`}
              >
                {r.delta === null ? "—" : formatAmount(r.key, r.delta, system, true)}
                {r.pct !== null && <span className="ml-1.5 text-ink-4">{formatPercent(r.pct)}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1.5 empty:hidden">
        <SideNote tag="A" side={a} date={dateOf.get(aId)} />
        <SideNote tag="B" side={b} date={dateOf.get(bId)} />
      </div>
    </>
  );
}

export function PileCompare({
  compareA,
  compareB,
  dateOf,
}: {
  compareA: string | null;
  compareB: string | null;
  dateOf: Map<string, string>;
}) {
  const surveyId = useViewerStore((s) => s.surveyId);
  const selected = useViewerStore((s) => {
    const id = s.selection?.kind === "measurement" ? s.selection.measurementIds[0] : null;
    return id ? (s.measurements.find((m) => m.id === id) ?? null) : null;
  });

  let body: React.ReactNode;
  if (!selected || selected.kind !== "stockpile") {
    body = <p className="caption text-ink-4">Select a stockpile to see how it changed from A to B.</p>;
  } else if (!isSavedStockpile(selected)) {
    body = <p className="caption text-ink-4">Save this stockpile to follow it across surveys.</p>;
  } else if (!compareA || !compareB) {
    body = <p className="caption text-ink-4">Pick both surveys to compare {selected.name}.</p>;
  } else {
    body = (
      <>
        <p className="caption truncate font-medium text-ink-1">{selected.name}</p>
        <PileDiff selected={selected} surveyId={surveyId} aId={compareA} bId={compareB} dateOf={dateOf} />
      </>
    );
  }

  return <div className="flex flex-col gap-2 border-t border-hairline px-3 pt-2.5 pb-3">{body}</div>;
}
