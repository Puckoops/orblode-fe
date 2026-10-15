"use client";

import { Copy01Icon, Download01Icon, Layers01Icon } from "@hugeicons/core-free-icons";
import {
  Alert,
  Band,
  Button,
  EmptyState,
  FigureCard,
  Select,
  Table,
  TBody,
  Td,
  TextLink,
  Th,
  THead,
  Tr,
} from "@puckoops/camelot";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader } from "@/components/brand/Loader";
import { StateChip } from "@/components/common/StateChip";
import {
  copyStockpilesForward,
  getInventory,
  type InventoryPile,
  type InventoryReport,
  type Survey,
} from "@/lib/api/orblodeSvc";
import { formatCubic, formatDelta, formatTonnes, formatValue, inventoryCsv } from "@/lib/reports";
import { pileState } from "@/lib/status";
import { toast } from "@/lib/toast";
import { formatSurveyDate } from "@/lib/utils";

const POLL_MS = 5000;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export function InventoryTab({ surveys }: { surveys: Survey[] | null }) {
  const [surveyId, setSurveyId] = useState("");
  const [report, setReport] = useState<InventoryReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!surveyId && surveys && surveys.length > 0) setSurveyId(surveys[0].id);
  }, [surveys, surveyId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const [loadedFor, setLoadedFor] = useState(surveyId);
  if (loadedFor !== surveyId) {
    setLoadedFor(surveyId);
    setReport(null);
    setError(null);
  }

  useEffect(() => {
    if (!surveyId) return;
    let cancelled = false;
    getInventory(surveyId)
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(message(err, "The inventory couldn't load."));
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId, version]);

  const computing = report?.piles.some((p) => p.state === "computing") ?? false;
  useEffect(() => {
    if (!computing) return;
    const id = window.setInterval(reload, POLL_MS);
    return () => window.clearInterval(id);
  }, [computing, reload]);

  const copyForward = async () => {
    setCopying(true);
    try {
      const created = await copyStockpilesForward(surveyId);
      toast.success(
        created.length
          ? `Copied ${created.length} stockpile${created.length === 1 ? "" : "s"} from the previous survey; adjust their outlines, then compute`
          : "This survey already has every pile of the previous survey"
      );
      reload();
    } catch (err) {
      toast.error(message(err, "Couldn't copy the stockpiles"));
    } finally {
      setCopying(false);
    }
  };

  if (surveys === null) return <Loader label="Loading surveys" />;
  if (surveys.length === 0) return <EmptyState icon={Layers01Icon} title="This site has no surveys yet." framed />;

  const survey = surveys.find((s) => s.id === surveyId);
  const totals = report?.totals;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          className="w-56"
          aria-label="Survey"
          value={surveyId}
          onValueChange={setSurveyId}
          options={surveys.map((s) => ({ value: s.id, label: `${formatSurveyDate(s.survey_date)} · ${s.survey_type || "survey"}` }))}
        />
        <Button variant="ghost" size="sm" iconStart={Copy01Icon} loading={copying} disabled={!report || copying} onClick={copyForward}>
          Copy from previous survey
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconStart={Download01Icon}
          disabled={!report || report.piles.length === 0}
          onClick={() => report && download(`inventory-${report.survey.date}.csv`, inventoryCsv(report))}
        >
          Export CSV
        </Button>
        {survey && (
          <TextLink as={Link} href={`/viewer/${survey.id}`} arrow="forward" className="caption ml-auto">
            Open in viewer
          </TextLink>
        )}
      </div>

      {error ? (
        <Alert tone="critical" title="The inventory couldn't load">
          {error}
        </Alert>
      ) : !report || !totals ? (
        <Loader label="Loading inventory" />
      ) : report.piles.length === 0 && report.removed_piles.length === 0 ? (
        <EmptyState
          icon={Layers01Icon}
          title="This survey has no stockpiles yet."
          description="Draw stockpiles in the viewer, or copy the previous survey's piles and adjust them."
          framed
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <FigureCard
              label="Stock"
              value={totals.tonnage_t}
              format={(v) => formatTonnes(v)}
              hero
              delta={totals.delta_tonnage_t != null ? formatDelta(totals.delta_tonnage_t, "t") : undefined}
              caption={report.previous_survey ? `since ${formatSurveyDate(report.previous_survey.date)}` : undefined}
            />
            <FigureCard
              label="Volume"
              value={totals.volume_m3}
              format={(v) => formatCubic(v)}
              delta={totals.delta_volume_m3 != null ? formatDelta(totals.delta_volume_m3, "m³") : undefined}
            />
            <FigureCard label="Value" value={totals.value} format={(v) => formatValue(v)} />
            <FigureCard label="Piles computed" value={totals.computed} caption={`of ${totals.piles}`} />
          </div>

          {totals.computed < totals.piles && (
            <Alert tone="warning" title={`${totals.piles - totals.computed} of ${totals.piles} piles have no numbers yet`}>
              Their volume is left out of the totals. Open the survey in the viewer to compute them.
            </Alert>
          )}

          <Band heading="By material" first>
            <Table density="compact">
              <THead>
                <Tr>
                  <Th>Material</Th>
                  <Th numeric>Piles</Th>
                  <Th numeric>Volume</Th>
                  <Th numeric>Tonnage</Th>
                  <Th numeric>Value</Th>
                  <Th numeric>Change</Th>
                </Tr>
              </THead>
              <TBody>
                {report.materials.map((m) => (
                  <Tr key={`${m.material_id}/${m.name}`}>
                    <Td primary>{m.name}</Td>
                    <Td numeric>{m.piles}</Td>
                    <Td numeric>{formatCubic(m.volume_m3)}</Td>
                    <Td numeric>{formatTonnes(m.tonnage_t)}</Td>
                    <Td numeric>{formatValue(m.value)}</Td>
                    <Td numeric>{formatDelta(m.delta_tonnage_t, "t")}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Band>

          <Band heading="Piles">
            <Table density="compact" footer={report.previous_survey ? `Changes against ${formatSurveyDate(report.previous_survey.date)}` : "No earlier survey with stockpiles"}>
              <THead>
                <Tr>
                  <Th>Pile</Th>
                  <Th>Material</Th>
                  <Th>State</Th>
                  <Th numeric>Volume</Th>
                  <Th numeric>Tonnage</Th>
                  <Th numeric>Change</Th>
                  <Th>Matched</Th>
                </Tr>
              </THead>
              <TBody>
                {report.piles.map((p) => (
                  <PileRow key={p.measurement_id} pile={p} />
                ))}
                {report.removed_piles.map((p) => (
                  <Tr key={`removed-${p.measurement_id}`}>
                    <Td primary>{p.name}</Td>
                    <Td>{p.material_name ?? "—"}</Td>
                    <Td>
                      <StateChip state={{ label: "Removed", tone: "neutral", glyph: "cross" }} />
                    </Td>
                    <Td numeric>—</Td>
                    <Td numeric>—</Td>
                    <Td numeric>{p.delta_tonnage_t != null ? formatDelta(p.delta_tonnage_t, "t") : formatDelta(p.delta_volume_m3, "m³")}</Td>
                    <Td>—</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Band>
        </>
      )}
    </div>
  );
}

function PileRow({ pile }: { pile: InventoryPile }) {
  const change =
    pile.delta_tonnage_t != null && pile.tonnage_t != null
      ? formatDelta(pile.delta_tonnage_t, "t")
      : pile.delta_volume_m3 != null
        ? formatDelta(pile.delta_volume_m3, "m³")
        : pile.previous_volume_m3 == null && pile.volume_m3 != null
          ? "New"
          : "—";
  return (
    <Tr>
      <Td primary>{pile.name}</Td>
      <Td>{pile.material_name ?? "—"}</Td>
      <Td>
        <StateChip state={pileState(pile.state)} />
      </Td>
      <Td numeric>{formatCubic(pile.volume_m3)}</Td>
      <Td numeric>{formatTonnes(pile.tonnage_t)}</Td>
      <Td numeric>{change}</Td>
      <Td>{pile.pile_link === "manual" ? "By hand" : "Automatic"}</Td>
    </Tr>
  );
}
