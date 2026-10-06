"use client";

// GCP verification panel (FR-17) — the viewer surface for the `gcp-verify`
// processor. A sibling of DesignConformancePanel, and presentational by the same
// convention: props in, callbacks out, store wiring lives in TreePanel.
//
// Two jobs, mirroring that panel's shape:
//   1. TRIGGER — a tolerance field + a "Verify alignment" button, disabled until
//      the survey has both ingested marks and a co-registered surface.
//   2. RESULT — the verdict chip, the residual statistics, and (on expand) the
//      marks that failed plus the ones the surface never covered.
//
// The statistics are shown even when the check FAILS, and especially then: an
// operator whose survey is out of tolerance needs the bias, the spread and the
// worst mark to know whether they are looking at a datum mismatch or a bad
// control point. A bare red "failed" would send them back to the file blind.

import React, { useState } from "react";
import { Target02Icon } from "@hugeicons/core-free-icons";
import { Button, Chip, Field, HelperText, Icon, Input, Skeleton } from "@puckoops/camelot";
import { Collapsible } from "radix-ui";

import type { StateStyle } from "@/lib/status";
import {
  DEFAULT_TOLERANCE_M,
  clampTolerance,
  failingMarks,
  uncoveredMarks,
  verdictLevel,
  verdictSummary,
  type GcpMark,
  type GcpVerdict,
} from "@/lib/viewer/gcpVerify";

/** Metres, at millimetre resolution — the scale the whole feature works at. */
function fmtM(value: number): string {
  return `${value >= 0 ? "" : "−"}${Math.abs(value).toFixed(3)} m`;
}

function StatCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-sm border border-hairline bg-surface px-2.5 py-2" title={hint}>
      <dt className="caps text-ink-4">{label}</dt>
      <dd className="num mt-0.5 text-ink-1">{value}</dd>
    </div>
  );
}

/** One row of the failing / uncovered lists. */
function MarkRow({ mark }: { mark: GcpMark }) {
  return (
    <li className="flex items-baseline justify-between gap-2 border-b border-hairline py-1.5 last:border-0">
      <span className="num-sm truncate text-ink-2">{mark.id}</span>
      {mark.residualM === null ? (
        <span className="caption shrink-0 text-ink-4">no surface coverage</span>
      ) : (
        <span className="num-sm shrink-0 text-ink-1">{fmtM(mark.residualM)}</span>
      )}
    </li>
  );
}

export interface GcpVerificationPanelProps {
  /** Marks are ingested and a co-registered surface exists — the check can run. */
  canVerify: boolean;
  /** How many control points the survey has ingested (0 → nothing to check). */
  gcpCount?: number;
  /** A `gcp-verify` dispatch is in flight. */
  verifying?: boolean;
  onVerify: (toleranceM: number) => void;
  /** The last run's verdict, or null when the survey has never been checked. */
  verdict: GcpVerdict | null;
  /** The per-point report — fetched lazily when the user expands the detail. */
  marks: GcpMark[] | null;
  marksLoading?: boolean;
  onExpandDetail?: () => void;
}

export function GcpVerificationPanel({
  canVerify,
  gcpCount,
  verifying = false,
  onVerify,
  verdict,
  marks,
  marksLoading = false,
  onExpandDetail,
}: GcpVerificationPanelProps) {
  // Seeded from the last run so re-checking keeps the site's own criterion
  // rather than snapping back to the default.
  const [tolerance, setTolerance] = useState(
    String(verdict?.toleranceM ?? DEFAULT_TOLERANCE_M)
  );
  const [detailOpen, setDetailOpen] = useState(false);

  const level = verdict ? verdictLevel(verdict) : null;
  const failing = marks ? failingMarks(marks) : [];
  const uncovered = marks ? uncoveredMarks(marks) : [];

  const chip: StateStyle =
    level === "pass"
      ? { label: "Within tolerance", tone: "teal", glyph: "check" }
      : level === "fail"
        ? { label: "Out of tolerance", tone: "red", glyph: "triangle" }
        : { label: "No coverage", tone: "amber", glyph: "circle-dashed" };

  return (
    <div className="flex flex-col gap-3 px-2 py-2">
      <div className="rounded-md border border-hairline bg-surface-2 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Icon icon={Target02Icon} size={16} className="shrink-0 text-ink-2" />
          <span className="small font-medium text-ink-1">Control point check</span>
          {typeof gcpCount === "number" && gcpCount > 0 && <span className="num-sm ml-auto text-ink-4">{gcpCount} GCPs</span>}
        </div>

        <div className="flex items-end gap-2">
          <Field
            label="Tolerance"
            className="w-28"
          >
            <Input
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              inputMode="decimal"
              aria-label="Alignment tolerance in metres"
              suffix="m"
              className="num"
            />
          </Field>
          <Button
            variant="primary"
            size="sm"
            disabled={!canVerify}
            loading={verifying}
            onClick={() => onVerify(clampTolerance(Number(tolerance)))}
            className="ml-auto"
          >
            {verifying ? "Checking…" : "Verify alignment"}
          </Button>
        </div>

        <p className="caption mt-1.5 text-ink-4">
          {canVerify ? "Compares the surface height at each surveyed mark. Vertical check." : "Needs ingested GCPs and a processed DSM/DTM surface."}
        </p>
      </div>

      {verdict && (
        <div className="rounded-md border border-hairline bg-surface-2 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Chip tone={chip.tone} glyph={chip.glyph}>
              {chip.label}
            </Chip>
            <span className="num-sm ml-auto text-ink-4">
              {verdict.withinTolerance}/{verdict.checked} within ±{verdict.toleranceM} m
            </span>
          </div>

          <p className="caption mb-2.5 text-ink-3">{verdictSummary(verdict)}</p>

          <dl className="grid grid-cols-2 gap-1.5">
            <StatCell label="RMSE" value={fmtM(verdict.rmseM)} hint="Root-mean-square vertical residual — bias and spread combined." />
            <StatCell
              label="Bias"
              value={fmtM(verdict.meanResidualM)}
              hint="Signed mean residual. A large bias with a small spread points at a vertical-datum mismatch."
            />
            <StatCell label="Spread" value={fmtM(verdict.stdDevM)} hint="Standard deviation about the mean, with the bias removed." />
            <StatCell label="Worst" value={fmtM(verdict.maxAbsResidualM)} />
          </dl>

          {verdict.total > verdict.checked && (
            <HelperText glyph="circle-dashed" className="mt-2">
              {verdict.total - verdict.checked} of {verdict.total} marks fall outside the surface — they were not checked.
            </HelperText>
          )}

          {/* Per-point detail, fetched only when opened. */}
          {(verdict.checked > verdict.withinTolerance || verdict.total > verdict.checked) && (
            <Collapsible.Root
              open={detailOpen}
              onOpenChange={(open) => {
                setDetailOpen(open);
                if (open) onExpandDetail?.();
              }}
            >
              <Collapsible.Trigger asChild>
                <Button variant="ghost" size="sm" className="mt-2.5 w-full">
                  {detailOpen ? "Hide marks" : "Show affected marks"}
                </Button>
              </Collapsible.Trigger>
              <Collapsible.Content className="mt-2">
                {marksLoading && (
                  <div className="flex flex-col gap-1.5" aria-busy="true" aria-label="Loading marks">
                    <Skeleton width="100%" height={16} />
                    <Skeleton width="100%" height={16} />
                  </div>
                )}

                {!marksLoading && failing.length > 0 && (
                  <>
                    <p className="caps mb-1 text-ink-4">Out of tolerance</p>
                    <ul>
                      {failing.map((m) => (
                        <MarkRow key={`f-${m.id}`} mark={m} />
                      ))}
                    </ul>
                  </>
                )}

                {!marksLoading && uncovered.length > 0 && (
                  <>
                    <p className="caps mt-3 mb-1 text-ink-4">Not covered by the surface</p>
                    <ul>
                      {uncovered.map((m) => (
                        <MarkRow key={`u-${m.id}`} mark={m} />
                      ))}
                    </ul>
                  </>
                )}
              </Collapsible.Content>
            </Collapsible.Root>
          )}
        </div>
      )}
    </div>
  );
}
