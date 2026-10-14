"use client";

// Zone 3 — FloatingToolbar (viewer-shell RE-PIVOT 2026-07-16). The user pointed
// at the original MeasurePalette tool grid and asked for THOSE six geometry
// primitives in the floating toolbar, with the CALCULATION modules ("what to
// compute and how") living in the right panel instead. So the toolbar is now a
// pure GEOMETRY picker — Point / Line / Polygon / Section / Probe / Slope — and
// carries no template/calculation choice. A tool starts a draw (or probe) with a
// NEUTRAL kind; which calculation runs over that geometry is chosen later in the
// DetailPanel (§calc-panel). This decouples the shape from the computation,
// exactly as the retired MeasurePalette grid did (it called startDraw with
// label/slope/toolKey and no kind), just relocated to the toolbar the user liked.
//
// Store wiring (§3.5): startDraw/startProbe/cancelDraw via useViewerActions; the
// single lit button is the one whose `palette:<id>` key === activeToolKey; and
// re-clicking the live tool cancels it (re-running startDraw would discard the
// in-progress vertices). Eraser is a pick mode — click a segment to delete it.
// Undo/Redo step through vertices, and Snap is a Phase-2 stub.

import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown01Icon,
  ChartAreaIcon,
  CircleIcon,
  Grid3x3Icon,
  LayoutTwoColumnIcon,
  MinusIcon,
  MountainIcon,
  MousePointerIcon,
  PentagonIcon,
  Redo02Icon,
  Tick02Icon,
  Undo02Icon,
} from "@hugeicons/core-free-icons";
import { Icon, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator, type IconDefinition } from "@puckoops/camelot";
import { toast } from "@/lib/toast";
import { useSelector } from "@xstate/react";

import { useViewerStore } from "@/lib/viewer/state/store";
import { useViewerActions } from "@/components/viewer/shell/viewerActions";
import { useInteractionActor } from "@/components/viewer/shell/interactionContext";
import { templatesFor, toolKeyFor, type MeasureTemplate, type TemplateGroup } from "@/lib/viewer/interaction/templates";
import { formatSurveyDate } from "@/lib/utils";
import { nextCompareSeed } from "@/lib/viewer/compare";
import { useCompareSurveys } from "@/components/viewer/shell/hooks/useCompareSurveys";

/** Icon-only pill that shows its label on hover — the floating feel the user asked to keep. The pill
 * grows through framer's transform-based layout animation and the label only fades. */
function ToolPill({ label, icon, active, onClick }: { label: string; icon: IconDefinition; active: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileTap={{ scale: 0.94 }}
      layout
      transition={{ type: "spring", stiffness: 400, damping: 26 }}
      className={`flex h-8 items-center overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus ${
        !active && hovered ? "bg-surface-2" : ""
      }`}
    >
      <motion.span
        layout
        animate={{ scale: hovered ? 1.12 : 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
          active ? "bg-emphasis-quiet text-ink-1" : hovered ? "text-ink-1" : "text-ink-2"
        }`}
      >
        <Icon icon={icon} size={18} />
      </motion.span>
      <AnimatePresence initial={false}>
        {hovered && (
          <motion.span
            key="label"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="caption font-medium whitespace-nowrap text-ink-1"
          >
            <span className="pr-2 pl-1">{label}</span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function FloatingToolbar() {
  // Interaction v2 is the only interactive path now (P3 scoped-delete): the
  // legacy toolbar/draw/edit are gone. Probe/point still ride the legacy
  // startProbe from inside FloatingToolbarV2 until they migrate to the machine.
  return <FloatingToolbarV2 />;
}

// Interaction v2 toolbar (plan §4): a pure CREATE-plane surface — the three
// primitive buttons whose dropdowns list that group's templates, and
// Cross-section on its own button (Propeller pattern), plus machine-driven
// Undo/Redo. No edit overloads: editing enters
// through the selected object (P2), never through these tools.

const GROUP_META: Record<TemplateGroup, { label: string; icon: IconDefinition }> = {
  point: { label: "Point", icon: MousePointerIcon },
  line: { label: "Line", icon: MinusIcon },
  polygon: { label: "Polygon", icon: PentagonIcon },
  section: { label: "Cross-section", icon: MountainIcon },
};

const TEMPLATE_ICONS: Partial<Record<string, IconDefinition>> = {
  point: MousePointerIcon,
  probe: CircleIcon,
  line: MinusIcon,
  section: MountainIcon,
  slope: ChartAreaIcon,
  polygon: PentagonIcon,
};

const MENU_CHEVRON = "h-8 w-6 rounded-full border-transparent text-ink-4 hover:text-ink-1 data-[state=open]:text-ink-1";

function FloatingToolbarV2() {
  const actor = useInteractionActor();
  const actions = useViewerActions();
  // Store mirror keeps probe lit-state consistent with legacy panels.
  const activeToolKey = useViewerStore((s) => s.activeToolKey);
  const probing = useViewerStore((s) => s.probing);
  const snapEnabled = useViewerStore((s) => s.snapEnabled);
  const setSnapEnabled = useViewerStore((s) => s.setSnapEnabled);
  const machineState = useSelector(actor, (s) => s.value);
  const armedTemplateId = useSelector(actor, (s) => s.context.template?.id ?? null);
  const draftLen = useSelector(actor, (s) => s.context.draft.length);

  const busyDrafting = (machineState === "placing" && draftLen > 0) || machineState === "calcReady";

  const launchTemplate = (t: MeasureTemplate) => {
    if (t.probe) {
      // Probe rides the LEGACY path (plan: machine gains probing in P2).
      const key = toolKeyFor(t.id);
      if (activeToolKey === key) {
        actions.cancelDraw();
        return;
      }
      if (busyDrafting) {
        toast.info("Finish the drawing (or press Esc) first");
        return;
      }
      if (machineState === "placing") actor.send({ type: "ESC" }); // armed, no verts
      actions.startProbe(key);
      return;
    }
    // Draw templates: the machine decides — same template toggles off, a
    // mid-draft switch is blocked (ledger #1), everything else arms.
    if (busyDrafting && armedTemplateId !== t.id) {
      toast.info("Finish the drawing (or press Esc) before switching tools");
      return;
    }
    if (probing) actions.cancelDraw(); // leave probe before arming a draw
    actor.send({ type: "TEMPLATE_PICKED", templateId: t.id });
  };

  return (
    <div
      role="toolbar"
      aria-label="Measurement tools"
      aria-orientation="horizontal"
      className="pointer-events-auto absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-hairline bg-surface/90 p-[7px] shadow-[var(--shadow-overlay)] backdrop-blur-md"
    >
      {(Object.keys(GROUP_META) as TemplateGroup[]).map((group) => {
        const meta = GROUP_META[group];
        const groupTemplates = templatesFor(group);
        const armed = groupTemplates.find((t) => (t.probe && activeToolKey === toolKeyFor(t.id)) || (!t.probe && armedTemplateId === t.id));
        const defaultTemplate = groupTemplates[0];
        const icon = armed ? (TEMPLATE_ICONS[armed.id] ?? meta.icon) : meta.icon;
        return (
          <div key={group} className="flex items-center">
            <ToolPill label={armed?.label ?? meta.label} icon={icon} active={!!armed} onClick={() => launchTemplate(armed ?? defaultTemplate)} />
            {groupTemplates.length > 1 && (
              <Menu align="start" minWidth={160} trigger={<IconButton icon={ArrowDown01Icon} aria-label={`${meta.label} templates`} size="sm" variant="bare" className={MENU_CHEVRON} />}>
                {groupTemplates.map((t) => {
                  const isArmed = armed?.id === t.id;
                  return (
                    <MenuItem key={t.id} icon={TEMPLATE_ICONS[t.id] ?? meta.icon} onSelect={() => launchTemplate(t)}>
                      <span className={isArmed ? "font-medium text-ink-1" : undefined}>{t.label}</span>
                      {isArmed && <Icon icon={Tick02Icon} size={16} label="Armed" className="ml-2 text-ink-1" />}
                    </MenuItem>
                  );
                })}
              </Menu>
            )}
          </div>
        );
      })}

      <div className="mx-1 h-5 w-px bg-hairline" />

      <ToolPill label="Undo" icon={Undo02Icon} active={false} onClick={() => actor.send({ type: "UNDO" })} />
      <ToolPill label="Redo" icon={Redo02Icon} active={false} onClick={() => actor.send({ type: "REDO" })} />
      <ToolPill
        label={snapEnabled ? "Snap on" : "Snap off"}
        icon={Grid3x3Icon}
        active={snapEnabled}
        onClick={() => {
          const next = !snapEnabled;
          setSnapEnabled(next);
          toast.info(next ? "Snapping on" : "Snapping off — hold Alt for one-off");
        }}
      />

      {/* Compare — its OWN section on the RIGHT (renders its leading divider so
          a single-epoch project leaves no dangling separator). Independent of
          the draw/probe tools; shares the compare store slice with the bottom
          SurveyCompare control, so the two stay in sync automatically. */}
      <CompareSplitButton />
    </div>
  );
}

// Compare split-button (Compare Mode, Task 1): a main toggle (seed-on-activate,
// mirroring SurveyCompare.activate via the shared nextCompareSeed) + a chevron
// dropdown of A ▸ B epoch pickers. Purely additive — its own toolbar section.

function CompareSplitButton() {
  const surveyId = useViewerStore((s) => s.surveyId);
  const projectId = useViewerStore((s) => s.manifest?.survey.project_id ?? null);
  const compareActive = useViewerStore((s) => s.compareActive);
  const compareA = useViewerStore((s) => s.compareA);
  const compareB = useViewerStore((s) => s.compareB);
  const setCompareActive = useViewerStore((s) => s.setCompareActive);
  const setCompareA = useViewerStore((s) => s.setCompareA);
  const setCompareB = useViewerStore((s) => s.setCompareB);

  const { surveys } = useCompareSurveys(projectId);

  // Compare needs >=2 epochs; a single-survey project has nothing to compare
  // (return null AFTER all hooks — no dangling divider either, it's ours).
  if (!surveys || surveys.length < 2) return null;

  const toggle = () => {
    if (compareActive) {
      setCompareActive(false);
      return;
    }
    // Same seeding as SurveyCompare.activate (B ??= current, A ??= prev epoch).
    const { a, b } = nextCompareSeed({ surveyId, surveys, compareA, compareB });
    setCompareB(b);
    setCompareA(a);
    setCompareActive(true);
  };

  return (
    <>
      <div className="mx-1 h-5 w-px bg-hairline" />
      <div className="flex items-center">
        <ToolPill label="Compare" icon={LayoutTwoColumnIcon} active={compareActive} onClick={toggle} />
        <Menu align="end" minWidth={192} trigger={<IconButton icon={ArrowDown01Icon} aria-label="Choose compare surveys" size="sm" variant="bare" className={MENU_CHEVRON} />}>
          <MenuLabel>Before (A)</MenuLabel>
          {surveys.map((s) => (
            <MenuItem key={`a-${s.id}`} icon={compareA === s.id ? Tick02Icon : undefined} onSelect={() => setCompareA(s.id)}>
              <span className="num">{formatSurveyDate(s.survey_date)}</span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuLabel>After (B)</MenuLabel>
          {surveys.map((s) => (
            <MenuItem key={`b-${s.id}`} icon={compareB === s.id ? Tick02Icon : undefined} onSelect={() => setCompareB(s.id)}>
              <span className="num">{formatSurveyDate(s.survey_date)}</span>
            </MenuItem>
          ))}
        </Menu>
      </div>
    </>
  );
}
