"use client";

// Zone 2 — TreePanel (viewer-shell §2.1/§4.2). Module-keyed frame: `measure` →
// WorkspaceTree (§6.3, over the TreeSource seam), `survey` → the existing
// SurveyList above LayerPanel, other modules → a phase empty-state. The old
// `Tabs(Surveys|Layers)` is retired — the module rail is the tab now (§4.2).
//
// DATA is read from the store with per-field selectors (§3.6); the Cesium-bound
// callbacks come from `useViewerActions()` (they close over ViewerCanvas's refs).
// The reused panels keep their prop interfaces verbatim — the derivations below
// (color maps, contour intervals, digital-twin availability) are the same
// `useMemo`s that lived in SurveyViewer, now computed here from store state.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useProcessing } from "@/lib/processing/store";
import { isStalled } from "@/lib/processing/summary";
import {
  ArrowLeft01Icon,
  ChartLineData01Icon,
  Copy01Icon,
  Download01Icon,
  Layers01Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { Alert, Button, EmptyState, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator, Tooltip } from "@puckoops/camelot";

import { Loader } from "@/components/brand/Loader";
import { EditSurveyDrawer } from "@/components/survey/EditSurveyDrawer";
import { useViewerStore } from "@/lib/viewer/state/store";
import { useViewerActions } from "@/components/viewer/shell/viewerActions";
import { useMayMeasure } from "@/components/viewer/shell/hooks/useMayMeasure";
import { useMay } from "@/lib/access/sitePermissions";
import {
  contourVectorRole,
  manifestLayersEmpty,
} from "@/components/viewer/shell/sceneHelpers";
import { isMineSiteProject } from "@/lib/dashboard/resolveProjectCenter";
import { USE_WORLD_TERRAIN } from "@/lib/viewer/cesiumIon";
import { LayerPanel } from "@/components/viewer/LayerPanel";
import { SurveyList } from "@/components/viewer/SurveyList";
import { WorkspaceTree } from "@/components/viewer/shell/WorkspaceTree";
import { DesignsPanel } from "@/components/viewer/shell/DesignsPanel";
import { ReplenishmentPanel } from "@/components/mm/viewer/ReplenishmentPanel";
import type { ModuleKey } from "@/lib/viewer/state/store";
import { EXPORT_FORMATS } from "@/lib/viewer/measurementExport";

const MODULE_TITLES: Record<Exclude<ModuleKey, "measure" | "survey">, string> = {
  designs: "Designs",
  media: "Media",
  hydro: "Hydro",
  crew: "Crew",
  machines: "Machines",
  replenishment: "Replenishment",
};

export function TreePanel() {
  const activeModule = useViewerStore((s) => s.activeModule);
  const manifest = useViewerStore((s) => s.manifest);
  const manifestError = useViewerStore((s) => s.manifestError);
  const surveyId = useViewerStore((s) => s.surveyId);
  const setTreePanelOpen = useViewerStore((s) => s.setTreePanelOpen);
  const actions = useViewerActions();
  const mayMeasure = useMayMeasure();
  const mayUpload = useMay(manifest?.survey.project_id, "can_upload");
  const [editing, setEditing] = useState(false);
  const [surveysKey, setSurveysKey] = useState(0);

  const surveyTitle = manifest ? `Survey ${manifest.survey.survey_date}` : "Survey viewer";

  return (
    <aside className="absolute inset-0 flex min-h-0 flex-col overflow-hidden border-r border-hairline bg-surface">
      {/* Header: survey title + working CRS · vertical datum, Export, and the collapse chevron. */}
      <div className="flex shrink-0 items-start gap-1 px-3 pt-4 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="h3 truncate text-ink-1">{surveyTitle}</h2>
          {manifest?.survey.working_crs && (
            <p className="num-sm truncate text-ink-4">
              {manifest.survey.working_crs}
              {manifest.survey.vertical_datum ? ` · ${manifest.survey.vertical_datum}` : ""}
            </p>
          )}
        </div>
        {manifest && mayUpload && (
          <Tooltip content="Edit survey">
            <IconButton icon={PencilEdit02Icon} aria-label="Edit survey" variant="bare" size="sm" onClick={() => setEditing(true)} />
          </Tooltip>
        )}
        <Menu align="end" minWidth={280} trigger={<IconButton icon={Download01Icon} aria-label="Export saved measurements" variant="bare" size="sm" />}>
          <MenuLabel>Export saved measurements</MenuLabel>
          {EXPORT_FORMATS.map(({ format, label }) => (
            <MenuItem key={format} onSelect={() => void actions.exportMeasurements(format)}>
              {label}
            </MenuItem>
          ))}
        </Menu>
        {mayMeasure && (
          <Menu align="end" minWidth={248} trigger={<IconButton icon={MoreHorizontalIcon} aria-label="Stockpile actions" variant="bare" size="sm" />}>
            <MenuItem icon={PlayIcon} onSelect={() => void actions.computeAllStockpiles()}>
              Compute all stockpiles
            </MenuItem>
            <MenuItem icon={Copy01Icon} onSelect={() => void actions.copyStockpilesForward()}>
              Copy stockpiles from previous survey
            </MenuItem>
            {manifest && (
              <>
                <MenuSeparator />
                <MenuItem icon={ChartLineData01Icon} asChild>
                  <Link href={`/reports?site=${encodeURIComponent(manifest.survey.project_id)}`}>Stockpile reports</Link>
                </MenuItem>
              </>
            )}
          </Menu>
        )}
        <Tooltip content="Collapse panel">
          <IconButton icon={ArrowLeft01Icon} aria-label="Collapse panel" variant="bare" size="sm" onClick={() => setTreePanelOpen(false)} />
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {manifestError ? (
          <Alert tone="critical" title="The survey couldn't load" className="m-3">
            {manifestError}
          </Alert>
        ) : activeModule === "measure" ? (
          // Renders without a manifest: an empty tree is the valid no-data state.
          <WorkspaceTree />
        ) : activeModule === "replenishment" ? (
          manifest ? <ReplenishmentPanel projectId={manifest.survey.project_id} surveyId={surveyId} /> : <Loader label="Loading survey" />
        ) : activeModule === "designs" ? (
          manifest ? <DesignsPanel projectId={manifest.survey.project_id} /> : <Loader label="Loading designs" />
        ) : activeModule === "survey" ? (
          manifest ? (
            <SurveyTree projectId={manifest.survey.project_id} surveyId={surveyId} surveysKey={surveysKey} />
          ) : (
            <Loader label="Loading survey" />
          )
        ) : (
          <EmptyState
            icon={Layers01Icon}
            title={`${MODULE_TITLES[activeModule as keyof typeof MODULE_TITLES]} arrives in a later phase.`}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/projects">Back to projects</Link>
              </Button>
            }
          />
        )}
      </div>

      <EditSurveyDrawer
        surveyId={editing ? surveyId : null}
        onClose={() => setEditing(false)}
        onChanged={() => {
          void actions.reloadManifest();
          setSurveysKey((k) => k + 1);
        }}
      />
    </aside>
  );
}

/** `survey` module — the existing SurveyList above LayerPanel, store-wired. The
 * layer derivations mirror SurveyViewer's `useMemo`s. */
function SurveyTree({ projectId, surveyId, surveysKey }: { projectId: string; surveyId: string; surveysKey: number }) {
  const manifest = useViewerStore((s) => s.manifest);
  const stalled = useProcessing((s) => s.current?.survey_id === surveyId && isStalled(s.current));
  const layerControls = useViewerStore((s) => s.layerControls);
  const designControls = useViewerStore((s) => s.designControls);
  const project = useViewerStore((s) => s.project);
  const view = useViewerStore((s) => s.view);
  const setView = useViewerStore((s) => s.setView);
  const viewMode = useViewerStore((s) => s.viewMode);
  const actions = useViewerActions();

  const availableContourIntervals = useMemo(() => {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const l of layerControls) {
      if (l.vectorRole && contourVectorRole(l.vectorRole) && l.intervalM && l.intervalM > 0) {
        if (!seen.has(l.intervalM)) {
          seen.add(l.intervalM);
          out.push(l.intervalM);
        }
      }
    }
    return out.sort((a, b) => a - b);
  }, [layerControls]);

  const contourIntervalM = view.contourIntervalM ?? availableContourIntervals[0] ?? null;
  const showDigitalTwin =
    project !== null &&
    manifest?.survey.project_id === project.id &&
    !isMineSiteProject(project);

  return (
    <>
      <SurveyList
        projectId={projectId}
        currentSurveyId={surveyId}
        refreshKey={surveysKey}
        onSurveyChanged={(id) => {
          if (id === surveyId) void actions.reloadManifest();
        }}
      />
      <LayerPanel
        layers={layerControls}
        designs={designControls}
        processing={manifestLayersEmpty(manifest) && !stalled}
        surveyStatus={manifest?.survey.status}
        terrainExaggeration={view.terrainExaggeration}
        exaggerationDisabled={viewMode === "2d"}
        baseMap={view.baseMap}
        elevation={view}
        contourIntervalM={contourIntervalM}
        availableContourIntervals={availableContourIntervals}
        digitalTwinEnabled={view.digitalTwinEnabled}
        digitalTwinAvailable={USE_WORLD_TERRAIN}
        showDigitalTwin={showDigitalTwin}
        sunLightingEnabled={view.sunLightingEnabled}
        sunHour={view.sunHour}
        onToggle={actions.handleToggle}
        onOpacity={actions.handleOpacity}
        onToggleDesign={actions.handleToggleDesign}
        onTerrainExaggeration={actions.setTerrainExaggeration}
        onSetBaseMap={actions.setBaseMap}
        onColorMapChange={actions.handleColorMapChange}
        onShadingChange={actions.handleShadingChange}
        onElevationChange={setView}
        onContourIntervalChange={actions.handleContourIntervalChange}
        onToggleDigitalTwin={actions.handleToggleDigitalTwin}
        onSunLightingChange={actions.handleSunLightingChange}
      />
    </>
  );
}
