"use client";

// The Cross section block of a line's inspector: show or hide its chart, and
// the surfaces it is compared with (another survey's DSM or DTM, this
// survey's DTM, a design, a reference level). Saved to params.cross_section.

import React, { useCallback, useState } from "react";
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button, IconButton, Input, Menu, MenuItem, MenuLabel, MenuSeparator, Select, Switch } from "@puckoops/camelot";

import type { Measurement } from "@/lib/api/orblodeSvc";
import { MAX_COMPARE, nextSeriesColor, refKey, type CompareRef } from "@/lib/viewer/profile";
import { PROFILE_SERIES } from "@/lib/viewer/sceneStyle";
import { styleOf } from "@/lib/viewer/style";
import { convertForDisplay, unitSystemOf } from "@/lib/viewer/units";
import { useViewerStore } from "@/lib/viewer/state/store";
import { formatSurveyDate } from "@/lib/utils";
import { useCrossSectionSettings, useSurfaceNames } from "@/components/viewer/shell/hooks/useCrossSection";

const DESIGN_STATE: Record<string, string> = {
  processing: "surface building",
  failed: "surface failed",
};

export function CrossSectionCard({ measurement }: { measurement: Measurement }) {
  const surveyId = useViewerStore((s) => s.surveyId);
  const hasDtm = useViewerStore((s) => s.manifest?.layers.terrain?.some((t) => t.surface_type === "dtm") ?? false);
  const { settings, save } = useCrossSectionSettings(measurement);
  const system = unitSystemOf(measurement.params);
  const unit = convertForDisplay("length_m", 1, system);
  const elevation = useCallback((m: number) => `${(m * unit.value).toFixed(2)} ${unit.unit}`, [unit.value, unit.unit]);
  const names = useSurfaceNames(elevation);
  const [rlDraft, setRlDraft] = useState<string | null>(null);

  if (!settings) return null;
  const { compare } = settings;
  const full = compare.length >= MAX_COMPARE;
  const has = (ref: CompareRef) => compare.some((c) => refKey(c) === refKey(ref));

  const update = (next: CompareRef[]) => void save({ ...settings, compare: next });
  const add = (ref: CompareRef) => {
    if (!has(ref)) update([...compare, { ...ref, color: nextSeriesColor(compare) }]);
  };
  const replace = (k: number, ref: CompareRef) => {
    if (compare.some((c, j) => j !== k && refKey(c) === refKey(ref))) return;
    update(compare.map((c, j) => (j === k ? ref : c)));
  };
  const cycleColor = (k: number) => {
    const at = PROFILE_SERIES.findIndex((c) => c.toLowerCase() === compare[k].color.toLowerCase());
    replace(k, { ...compare[k], color: PROFILE_SERIES[(at + 1) % PROFILE_SERIES.length] });
  };
  const addLevel = () => {
    const v = Number(rlDraft);
    if (rlDraft === null || rlDraft.trim() === "" || !Number.isFinite(v)) return;
    add({ type: "reference_level", elevation_m: v / unit.value, color: "" });
    setRlDraft(null);
  };

  const others = (names.surveys ?? []).filter((s) => s.id !== surveyId).reverse();
  const designs = names.designs ?? [];
  const ownDtm: CompareRef = { type: "survey_terrain", survey_id: surveyId, surface: "dtm", color: "" };

  return (
    <section aria-label="Cross section" className="flex flex-col gap-2 rounded-md border border-hairline bg-surface-2 p-2.5">
      <Switch size="sm" label="Show cross section" checked={settings.show} onCheckedChange={(show) => void save({ ...settings, show })} />
      {settings.show && (
        <>
          <ul className="flex flex-col gap-1" aria-label="Surfaces on the cross section">
            <li className="caption flex items-center gap-2 py-0.5 text-ink-2">
              <span aria-hidden className="h-0.5 w-4 shrink-0 rounded-full" style={{ backgroundColor: styleOf(measurement.params).stroke }} />
              <span className="min-w-0 flex-1 truncate">{names.primary}</span>
              <span className="text-ink-4">this survey</span>
            </li>
            {compare.map((c, k) => (
              <li key={refKey(c)} className="caption flex items-center gap-2 text-ink-2">
                <button
                  type="button"
                  aria-label={`Change the colour of ${names.of(c)}`}
                  onClick={() => cycleColor(k)}
                  className="flex h-6 w-4 shrink-0 items-center"
                >
                  <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ backgroundColor: c.color }} />
                </button>
                <span className="min-w-0 flex-1 truncate">{names.of(c)}</span>
                {c.type === "survey_terrain" && (
                  <Select
                    variant="filter"
                    aria-label={`Surface of ${names.of(c)}`}
                    value={c.surface}
                    onValueChange={(v) => replace(k, { ...c, surface: v === "dtm" ? "dtm" : "dsm" })}
                    options={[
                      { value: "dsm", label: "DSM" },
                      { value: "dtm", label: "DTM" },
                    ]}
                  />
                )}
                <IconButton icon={Cancel01Icon} aria-label={`Remove ${names.of(c)}`} size="sm" variant="bare" onClick={() => update(compare.filter((_, j) => j !== k))} />
              </li>
            ))}
          </ul>

          {rlDraft !== null ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addLevel();
              }}
            >
              <Input
                autoFocus
                type="number"
                step="any"
                inputMode="decimal"
                aria-label="Reference level elevation"
                placeholder="Elevation"
                suffix={unit.unit}
                value={rlDraft}
                onChange={(e) => setRlDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setRlDraft(null)}
              />
              <Button size="sm" variant="primary" type="submit">
                Add
              </Button>
              <Button size="sm" variant="quiet" onClick={() => setRlDraft(null)}>
                Cancel
              </Button>
            </form>
          ) : (
            <Menu
              align="start"
              minWidth={260}
              trigger={
                <Button size="sm" variant="ghost" iconStart={Add01Icon} disabled={full} className="self-start">
                  {full ? `Up to ${MAX_COMPARE} surfaces` : "Add design or survey"}
                </Button>
              }
            >
              {hasDtm && (
                <>
                  <MenuLabel>This survey</MenuLabel>
                  <MenuItem disabled={has(ownDtm)} onSelect={() => add(ownDtm)}>
                    {names.primary.replace(/DSM$/, "DTM")}
                  </MenuItem>
                </>
              )}
              <MenuLabel>Surveys</MenuLabel>
              {others.length === 0 && <MenuItem disabled>No other surveys in this project</MenuItem>}
              {others.map((s) => {
                const ref: CompareRef = { type: "survey_terrain", survey_id: s.id, surface: "dsm", color: "" };
                return (
                  <MenuItem key={s.id} disabled={has(ref)} onSelect={() => add(ref)}>
                    {s.survey_date ? formatSurveyDate(s.survey_date) : s.id} · DSM
                  </MenuItem>
                );
              })}
              <MenuLabel>Designs</MenuLabel>
              {designs.length === 0 && <MenuItem disabled>No designs in this project</MenuItem>}
              {designs.map((d) => {
                const state = d.surface?.status ?? "missing";
                const ref: CompareRef = { type: "design", design_id: d.id, color: "" };
                return (
                  <MenuItem key={d.id} disabled={state !== "ready" || has(ref)} onSelect={() => add(ref)}>
                    {d.name}
                    {state !== "ready" && <span className="text-ink-4"> · {DESIGN_STATE[state] ?? "no surface"}</span>}
                  </MenuItem>
                );
              })}
              <MenuSeparator />
              <MenuItem onSelect={() => setRlDraft("")}>Reference level…</MenuItem>
            </Menu>
          )}
          <p className="caption text-ink-4">Heights are in each surface&apos;s own vertical datum. Click the chart to pin a reading.</p>
        </>
      )}
    </section>
  );
}
