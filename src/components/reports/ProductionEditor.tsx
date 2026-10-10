"use client";

import { FileImportIcon } from "@hugeicons/core-free-icons";
import { Alert, Band, Button, DateInput, Field, Input, Table, TBody, Td, TextLink, Th, THead, Tr } from "@puckoops/camelot";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listProductionRecords, putProductionRecords, type Material, type ProductionRecord } from "@/lib/api/orblodeSvc";
import { formatTonnes, parseProductionCsv, productionPeriods } from "@/lib/reports";
import { toast } from "@/lib/toast";
import { formatSurveyDate } from "@/lib/utils";

type Draft = Record<string, { mined: string; dispatched: string }>;

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

function draftOf(records: ProductionRecord[], start: string, end: string): Draft {
  const draft: Draft = {};
  for (const r of records) {
    if (r.period_start === start && r.period_end === end) draft[r.material_id] = { mined: String(r.mined_t), dispatched: String(r.dispatched_t) };
  }
  return draft;
}

/**
 * The site's production records, one period at a time: what was mined and dispatched of each
 * material, which reconciliation weighs against the surveys. Saving replaces that period only.
 */
export function ProductionEditor({
  projectId,
  materials,
  period,
  onSaved,
}: {
  projectId: string;
  materials: Material[] | null;
  period: [string, string] | null;
  onSaved: () => void;
}) {
  const [records, setRecords] = useState<ProductionRecord[] | null>(null);
  const [start, setStart] = useState<string | null>(period?.[0] ?? null);
  const [end, setEnd] = useState<string | null>(period?.[1] ?? null);
  const [draft, setDraft] = useState<Draft>({});
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listProductionRecords(projectId)
      .then(setRecords)
      .catch((err) => {
        console.error("Failed to fetch production records:", err);
        setRecords([]);
      });
  }, [projectId]);

  const periodKey = period?.join("/");
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!periodKey) return;
    const [s, e] = periodKey.split("/");
    setStart(s);
    setEnd(e);
  }, [periodKey]);

  useEffect(() => {
    if (records && start && end) setDraft(draftOf(records, start, end));
  }, [records, start, end]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const periods = useMemo(() => productionPeriods(records ?? []), [records]);
  const names = useMemo(() => new Map((materials ?? []).map((m) => [m.id, m.name])), [materials]);

  const setLine = (materialId: string, field: "mined" | "dispatched", value: string) =>
    setDraft((d) => ({ ...d, [materialId]: { ...(d[materialId] ?? { mined: "", dispatched: "" }), [field]: value } }));

  const importCsv = useCallback(
    async (file: File) => {
      const parsed = parseProductionCsv(await file.text(), materials ?? []);
      setImportErrors(parsed.errors);
      if (parsed.lines.length === 0) return;
      const next: Draft = {};
      for (const l of parsed.lines) next[l.material_id] = { mined: String(l.mined_t), dispatched: String(l.dispatched_t) };
      setDraft(next);
      toast.info(`Imported ${parsed.lines.length} material${parsed.lines.length === 1 ? "" : "s"}; check the figures, then save`);
    },
    [materials]
  );

  const save = async () => {
    if (!start || !end) return;
    const lines = [];
    for (const [materialId, v] of Object.entries(draft)) {
      const mined = v.mined === "" ? 0 : Number(v.mined);
      const dispatched = v.dispatched === "" ? 0 : Number(v.dispatched);
      if (!Number.isFinite(mined) || !Number.isFinite(dispatched) || mined < 0 || dispatched < 0) {
        toast.error(`${names.get(materialId) ?? "A material"}: tonnages must be numbers of 0 or more`);
        return;
      }
      if (mined || dispatched) lines.push({ material_id: materialId, mined_t: mined, dispatched_t: dispatched });
    }
    setSaving(true);
    try {
      setRecords(await putProductionRecords(projectId, start, end, lines));
      toast.success(lines.length ? "Production records saved" : "Production records cleared for this period");
      onSaved();
    } catch (err) {
      toast.error(message(err, "Couldn't save the production records"));
    } finally {
      setSaving(false);
    }
  };

  const valid = !!start && !!end && start <= end;

  return (
    <Band
      heading="Production records"
      caption="What the site reports it mined and dispatched. Reconciliation counts the periods that fall between the two surveys."
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importCsv(f);
            }}
          />
          <Button variant="ghost" size="sm" iconStart={FileImportIcon} disabled={!materials?.length} onClick={() => fileRef.current?.click()}>
            Import CSV
          </Button>
        </>
      }
    >
      {materials && materials.length === 0 ? (
        <Alert tone="info" title="Add the site's materials first">
          Production is recorded per material. Add them on the{" "}
          <TextLink as={Link} href={`/reports?site=${encodeURIComponent(projectId)}&tab=materials`}>
            Materials
          </TextLink>{" "}
          tab.
        </Alert>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="From">
              <DateInput value={start} onChange={setStart} />
            </Field>
            <Field label="To">
              <DateInput value={end} onChange={setEnd} min={start ?? undefined} />
            </Field>
            <Button variant="primary" size="sm" loading={saving} disabled={!valid || !materials} onClick={save}>
              Save period
            </Button>
          </div>

          {importErrors.length > 0 && (
            <Alert tone="warning" title="Some rows weren't imported" onDismiss={() => setImportErrors([])}>
              {importErrors.slice(0, 5).join(" ")}
              {importErrors.length > 5 ? ` And ${importErrors.length - 5} more.` : ""}
            </Alert>
          )}

          <Table density="compact">
            <THead>
              <Tr>
                <Th>Material</Th>
                <Th numeric>Mined (t)</Th>
                <Th numeric>Dispatched (t)</Th>
              </Tr>
            </THead>
            <TBody>
              {(materials ?? []).map((m) => (
                <Tr key={m.id}>
                  <Td primary>{m.name}</Td>
                  <Td numeric>
                    <Input
                      aria-label={`${m.name} mined tonnes`}
                      type="number"
                      min={0}
                      className="ml-auto w-32 text-right"
                      value={draft[m.id]?.mined ?? ""}
                      onChange={(e) => setLine(m.id, "mined", e.target.value)}
                    />
                  </Td>
                  <Td numeric>
                    <Input
                      aria-label={`${m.name} dispatched tonnes`}
                      type="number"
                      min={0}
                      className="ml-auto w-32 text-right"
                      value={draft[m.id]?.dispatched ?? ""}
                      onChange={(e) => setLine(m.id, "dispatched", e.target.value)}
                    />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>

          {periods.length > 0 && (
            <Table density="compact" footer="Pick a period to edit it.">
              <THead>
                <Tr>
                  <Th>Recorded period</Th>
                  <Th>Material</Th>
                  <Th numeric>Mined</Th>
                  <Th numeric>Dispatched</Th>
                </Tr>
              </THead>
              <TBody>
                {periods.flatMap((p) =>
                  p.records.map((r, i) => (
                    <Tr
                      key={r.id}
                      interactive
                      selected={p.start === start && p.end === end}
                      onClick={() => {
                        setStart(p.start);
                        setEnd(p.end);
                      }}
                    >
                      <Td primary>{i === 0 ? `${formatSurveyDate(p.start)} – ${formatSurveyDate(p.end)}` : ""}</Td>
                      <Td>{names.get(r.material_id) ?? "Unknown material"}</Td>
                      <Td numeric>{formatTonnes(r.mined_t)}</Td>
                      <Td numeric>{formatTonnes(r.dispatched_t)}</Td>
                    </Tr>
                  ))
                )}
              </TBody>
            </Table>
          )}
        </div>
      )}
    </Band>
  );
}
