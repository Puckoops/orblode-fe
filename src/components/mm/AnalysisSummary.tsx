"use client";

import {
  Alert,
  HelperText,
  Progress,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@puckoops/camelot";
import type { Analysis } from "@/lib/api/mm";
import { coverage } from "@/lib/mm/coverage";
import { ha, m3, pct, thousands } from "@/lib/mm/format";
import { Figure, Figures, StatusChip, VERDICT } from "./common";

export const studyRunning = (a: Analysis) =>
  a.status === "queued" || a.status === "computing";

/** A study the daemon is still measuring, or one it could not measure. */
export function StudyProgress({ a }: { a: Analysis }) {
  if (a.status === "failed")
    return (
      <Alert tone="critical" title="The study failed">
        {a.progress?.error || "It could not be measured."} Measure the lease
        again.
      </Alert>
    );
  return (
    <div className="flex flex-col gap-2">
      <Progress
        value={a.status === "queued" ? null : (a.progress?.percent ?? 0)}
        max={100}
        label={a.progress?.stage || "Waiting to start"}
        showValue={a.status === "computing"}
        format={(v) => `${Math.round(v)} %`}
      />
      <HelperText>
        A large lease takes several minutes. You can leave this page: you’ll get
        a notice when it’s done.
      </HelperText>
    </div>
  );
}

/** A replenishment study's figures: the three methods, the adopted volume and the rules it was tested against. */
export function AnalysisSummary({
  a,
  compact,
}: {
  a: Analysis;
  compact?: boolean;
}) {
  const r = a.results;
  const c = coverage(r);
  // Studies measured before coverage was recorded took the uncertainty over the whole lease.
  const uncertainOverM2 =
    r.coverage_pct === undefined ? r.effective_m2 : c.measuredM2;
  return (
    <div className="flex flex-col gap-4">
      {c.short && (
        <Alert tone="warning" title="Part of the lease wasn’t measured">
          Only {ha(c.measuredM2)} of {ha(r.effective_m2)} ({c.pct.toFixed(0)} %)
          had data in both surveys. The other {ha(c.missingM2)} aren’t in these
          figures.
        </Alert>
      )}
      <Figures>
        <Figure
          label="Net deposition"
          value={m3(r.adopted_m3)}
          note={
            c.short
              ? `post minus pre, on the ${ha(c.measuredM2)} measured`
              : "post minus pre, inside the lease"
          }
        />
        <Figure
          label="Cross-section check"
          value={m3(r.end_area.net_m3)}
          note={`${pct(r.end_area_diff_pct)} against it`}
        />
        {r.empirical_m3 !== undefined && (
          <Figure
            label="Empirical check"
            value={m3(r.empirical_m3)}
            note={`${pct(r.empirical_diff_pct)} against it`}
          />
        )}
        <Figure
          label="Proposed extraction"
          value={`${thousands(a.inputs.proposed_m3)} m³/yr`}
          note={`${a.rules.ratio_pct.toFixed(0)} % of replenishment`}
        />
        <Figure
          label="Verdict"
          value={<StatusChip map={VERDICT} value={a.verdict} />}
          note={a.rules.recommendation}
        />
      </Figures>
      {!compact && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Table density="compact" minWidth={320}>
            <THead>
              <Tr>
                <Th>Method</Th>
                <Th numeric>Volume</Th>
              </Tr>
            </THead>
            <TBody>
              <Tr>
                <Td primary>A · {a.surface.toUpperCase()} differencing</Td>
                <Td numeric>{m3(r.dtm_diff.net_m3)}</Td>
              </Tr>
              <Tr>
                <Td> deposition / erosion</Td>
                <Td numeric>
                  {thousands(r.dtm_diff.fill_m3)} /{" "}
                  {thousands(r.dtm_diff.cut_m3)}
                </Td>
              </Tr>
              <Tr>
                <Td primary>
                  B · Cross-section end area ({r.end_area.stations.length}{" "}
                  sections, {a.inputs.spacing_m} m)
                </Td>
                <Td numeric>{m3(r.end_area.net_m3)}</Td>
              </Tr>
              <Tr>
                <Td primary>C · Empirical bed-load</Td>
                <Td numeric>
                  {r.empirical_m3 !== undefined
                    ? m3(r.empirical_m3)
                    : "not given"}
                </Td>
              </Tr>
              <Tr>
                <Td primary>Adopted (A, checked by B and C)</Td>
                <Td numeric>
                  <strong>{m3(r.adopted_m3)}</strong>
                </Td>
              </Tr>
              <Tr>
                <Td>Measured: both surveys have data</Td>
                <Td numeric>
                  {ha(c.measuredM2)} · {c.pct.toFixed(0)} %
                </Td>
              </Tr>
              <Tr>
                <Td>
                  Uncertainty ({(a.inputs.vertical_accuracy_m * 100).toFixed(0)}{" "}
                  cm over {ha(uncertainOverM2)})
                </Td>
                <Td numeric>± {m3(r.uncertainty_m3)}</Td>
              </Tr>
              <Tr>
                <Td>Left out (water, masks)</Td>
                <Td numeric>{ha(r.masked_m2)}</Td>
              </Tr>
            </TBody>
          </Table>
          <Table density="compact" minWidth={320}>
            <THead>
              <Tr>
                <Th>Rule</Th>
                <Th>Result</Th>
              </Tr>
            </THead>
            <TBody>
              <Tr>
                <Td primary>
                  Extraction at most {a.rules.max_extraction_pct} % of
                  replenishment
                </Td>
                <Td>
                  {a.rules.ratio_pct.toFixed(1)} % ·{" "}
                  {a.rules.ratio_ok ? "met" : "not met"}
                </Td>
              </Tr>
              <Tr>
                <Td primary>Average depth within the cap</Td>
                <Td>
                  {a.rules.proposed_depth_m.toFixed(2)} m of{" "}
                  {a.rules.depth_cap_m.toFixed(2)} m ·{" "}
                  {a.rules.depth_ok ? "met" : "not met"}
                </Td>
              </Tr>
              <Tr>
                <Td primary>Recommended</Td>
                <Td>{m3(a.rules.recommended_m3)} a year</Td>
              </Tr>
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
