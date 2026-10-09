"use client";

// Zone 1 — ModuleRail (viewer-shell §2.1/§4.1, polished in 1.3c-ii). The 48px
// vertical rail that replaces the dashboard chrome on viewer routes. Top →
// bottom: Logo (→ /globe — the viewer's exit, replacing the old in-panel back
// arrow), divider, the modules (Measure + Survey live, the rest disabled with a
// phase tooltip, D7). Outputs moved to the globe rail (project/survey source
// data downloads, §"Files"); Help/Avatar removed — the globe rail's own
// profile button covers account access.
//
// Behavior (§4.1): clicking a live module sets `activeModule` and opens the
// tree if collapsed; clicking the ALREADY-active module toggles
// `treePanelOpen`. Module switching MUST NOT cancel an active draw — it only
// touches `activeModule`/`treePanelOpen`, never the draw state.

import {
  DraftingCompassIcon,
  DropletsIcon,
  Image01Icon,
  Layers01Icon,
  RulerIcon,
  TruckIcon,
  UsersIcon,
} from "@hugeicons/core-free-icons";
import { IconButton, Tooltip, type IconDefinition } from "@puckoops/camelot";
import Link from "next/link";

import { OrblodeMark } from "@/components/brand/OrblodeLogo";
import { useViewerStore } from "@/lib/viewer/state/store";
import type { ModuleKey } from "@/lib/viewer/state/store";

interface ModuleDef {
  key: ModuleKey;
  label: string;
  icon: IconDefinition;
  live: boolean;
}

// Order + live-set from D7: Measure + Survey functional in Phase 1, the rest scaffolded.
const MODULES: ModuleDef[] = [
  { key: "measure", label: "Measure", icon: RulerIcon, live: true },
  { key: "survey", label: "Survey", icon: Layers01Icon, live: true },
  { key: "designs", label: "Designs", icon: DraftingCompassIcon, live: false },
  { key: "media", label: "Media", icon: Image01Icon, live: false },
  { key: "hydro", label: "Hydro", icon: DropletsIcon, live: false },
  { key: "crew", label: "Crew", icon: UsersIcon, live: false },
  { key: "machines", label: "Machines", icon: TruckIcon, live: false },
];

export function ModuleRail() {
  const activeModule = useViewerStore((s) => s.activeModule);
  const treePanelOpen = useViewerStore((s) => s.treePanelOpen);
  const setActiveModule = useViewerStore((s) => s.setActiveModule);
  const setTreePanelOpen = useViewerStore((s) => s.setTreePanelOpen);

  const onSelect = (m: ModuleDef) => {
    if (!m.live) return;
    if (m.key === activeModule) {
      // Re-clicking the active module toggles the tree panel (§4.1).
      setTreePanelOpen(!treePanelOpen);
      return;
    }
    setActiveModule(m.key);
    if (!treePanelOpen) setTreePanelOpen(true);
  };

  return (
    <nav aria-label="Viewer modules" className="flex h-full w-12 shrink-0 flex-col items-center border-r border-hairline bg-surface py-3">
      <Tooltip content="Back to globe" side="right">
        <Link href="/globe" aria-label="Back to globe" className="flex size-9 items-center justify-center rounded-sm text-ink-1 hover:bg-surface-2">
          <OrblodeMark size={18} />
        </Link>
      </Tooltip>

      <div className="my-3 h-px w-7 shrink-0 bg-hairline" />

      <div className="flex flex-col items-center gap-1">
        {MODULES.map((m) => {
          const active = m.key === activeModule;
          return (
            <Tooltip
              key={m.key}
              side="right"
              content={
                m.live ? (
                  m.label
                ) : (
                  <span className="flex flex-col">
                    <span>{m.label}</span>
                    <span>Coming in a later phase</span>
                  </span>
                )
              }
            >
              {/* aria-disabled + a guarded click (not `disabled`) so a disabled module still shows its phase tooltip. */}
              <IconButton
                icon={m.icon}
                aria-label={m.label}
                aria-pressed={active}
                aria-disabled={!m.live}
                onClick={() => onSelect(m)}
                className={`size-9 ${
                  active ? "border-hairline-strong bg-emphasis-quiet text-ink-1" : m.live ? "border-transparent" : "cursor-not-allowed border-transparent opacity-50"
                }`}
              />
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
}
