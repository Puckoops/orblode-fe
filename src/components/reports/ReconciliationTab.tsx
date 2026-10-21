"use client";

import { Layers01Icon } from "@hugeicons/core-free-icons";
import { Alert, Band, EmptyState, Field, Input, Select, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader } from "@/components/brand/Loader";
import { StateChip } from "@/components/common/StateChip";
import {
  getReconciliation,
  type Material,
  type ReconciliationReport,
  type ReconciliationRow,
  type Survey,
} from "@/lib/api/orblodeSvc";
import { defaultReconciliationPair, formatDelta, formatPercent, formatTonnes } from "@/lib/reports";
import { useSiteAlerts } from "@/lib/reports/alerts";
import { varianceState } from "@/lib/status";
import { formatSurveyDate } from "@/lib/utils";
import { ProductionEditor } from "./ProductionEditor";

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function ReconciliationTab({
  projectId,
  surveys,
  materials,
}: {
  projectId: string;
  surveys: Survey[] | null;
  materials: Material[] | null;
}) {
  const oldestFirst = useMemo(() => (surveys ?? []).slice().sort((a, b) => a.survey_date.localeCompare(b.survey_date)), [surveys]);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [green, setGreen] = useState("3");
  const [amber, setAmber] = useState("7");
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (fromId || toId) return;
    const pair = defaultReconciliationPair(oldestFirst.map((s) => ({ id: s.id, date: s.survey_date })));
    if (pair) {
      setFromId(pair[0]);
      setToId(pair[1]);
    }
  }, [oldestFirst, fromId, toId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const from = oldestFirst.find((s) => s.id === fromId);
  const to = oldestFirst.find((s) => s.id === toId);
  const greenPct = Number(green);
  const amberPct = Number(amber);
  const thresholdsValid = greenPct > 0 && amberPct >= greenPct;
  const ordered = from && to && from.survey_date < to.survey_date;

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const refreshAlerts = useSiteAlerts((s) => s.refresh);
  // Saving production re-checks the site before the save answers, so the rail's red count can follow at once.
  const onProductionSaved = useCallback(() => {
    reload();
    void refreshAlerts();
  }, [reload, refreshAlerts]);

  useEffect(() => {
    if (!fromId || !toId || !ordered || !thresholdsValid) return;
    let cancelled = false;
    getReconciliation(projectId, fromId, toId, { green_pct: greenPct, amber_pct: amberPct })
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(message(err, "The reconciliation couldn't load."));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, fromId, toId, ordered, thresholdsValid, greenPct, amberPct, version]);

  if (surveys === null) return <Loader label="Loading surveys" />;
  if (oldestFirst.length < 2) {
    return <EmptyState icon={Layers01Icon} title="Reconciliation needs two surveys of this project." framed />;
  }

  const options = oldestFirst.map((s) => ({ value: s.id, label: formatSurveyDate(s.survey_date) }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Opening survey">
          <Select className="w-44" value={fromId} onValueChange={setFromId} options={options} />
        </Field>
        <Field label="Closing survey">
          <Select className="w-44" value={toId} onValueChange={setToId} options={options} />
        </Field>
        <Field label="Green within">
          <Input className="w-24" type="number" min={0} step={0.5} value={green} onChange={(e) => setGreen(e.target.value)} suffix="%" />
        </Field>
        <Field label="Amber within">
          <Input className="w-24" type="number" min={0} step={0.5} value={amber} onChange={(e) => setAmber(e.target.value)} suffix="%" />
        </Field>
      </div>

      {!ordered ? (
        <Alert tone="warning" title="Pick an opening survey dated before the closing survey" />
      ) : !thresholdsValid ? (
        <Alert tone="warning" title="Green must be above 0 % and amber at least green" />
      ) : error ? (
        <Alert tone="critical" title="The reconciliation couldn't load">
          {error}
        </Alert>
      ) : !report ? (
        <Loader label="Loading reconciliation" />
      ) : (
        <>
          {report.uncomputed > 0 && (
            <Alert tone="warning" title={`${report.uncomputed} pile${report.uncomputed === 1 ? " has" : "s have"} no numbers yet`}>
              Uncomputed piles are left out of both surveys&apos; stock. Compute them from the inventory.
            </Alert>
          )}
          <Band
            heading={`${formatSurveyDate(report.from.date)} to ${formatSurveyDate(report.to.date)}`}
            caption="Opening stock plus mined less dispatched, against the stock surveyed at the close."
            first
          >
            <Table density="compact" isEmpty={report.materials.length === 0} empty="Neither survey has computed stockpiles.">
              <THead>
                <Tr>
                  <Th>Material</Th>
                  <Th numeric>Opening</Th>
                  <Th numeric>Mined</Th>
                  <Th numeric>Dispatched</Th>
                  <Th numeric>Mass balance</Th>
                  <Th numeric>Surveyed</Th>
                  <Th numeric>Variance</Th>
                  <Th numeric>%</Th>
                  <Th>Status</Th>
                </Tr>
              </THead>
              <TBody>
                {report.materials.map((r) => (
                  <Row key={`${r.material_id}/${r.name}`} row={r} />
                ))}
                {report.materials.length > 1 && <Row row={report.overall} />}
              </TBody>
            </Table>
          </Band>
        </>
      )}

      <ProductionEditor
        projectId={projectId}
        materials={materials}
        period={from && to && ordered ? [from.survey_date, to.survey_date] : null}
        onSaved={onProductionSaved}
      />
    </div>
  );
}

function Row({ row }: { row: ReconciliationRow }) {
  return (
    <Tr>
      <Td primary>{row.name}</Td>
      <Td numeric>{formatTonnes(row.opening_t)}</Td>
      <Td numeric>{formatTonnes(row.mined_t)}</Td>
      <Td numeric>{formatTonnes(row.dispatched_t)}</Td>
      <Td numeric>{formatTonnes(row.mass_balance_t)}</Td>
      <Td numeric>{formatTonnes(row.survey_closing_t)}</Td>
      <Td numeric>{formatDelta(row.variance_t, "t")}</Td>
      <Td numeric>{formatPercent(row.variance_pct)}</Td>
      <Td>
        <StateChip state={varianceState(row.status)} />
      </Td>
    </Tr>
  );
}
