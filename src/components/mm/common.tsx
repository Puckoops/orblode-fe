"use client";

import { MountainIcon } from "@hugeicons/core-free-icons";
import { Button, Chip, EmptyState, type ChipTone, type GlyphShape } from "@puckoops/camelot";
import { Fragment, useEffect, type ReactNode } from "react";
import { Loader } from "@/components/brand/Loader";
import { MINOR_MINERALS, useMinorMinerals, useMinorMineralsLicence } from "@/hooks/useMinorMinerals";
import { useSitePermissions } from "@/lib/access/sitePermissions";
import { getProject } from "@/lib/api/userSvc";
import { useOrganisation } from "@/lib/organisation/store";
import { useWorkspaces } from "@/lib/workspaces/store";

/** Offered on a minor-minerals page while another kind of workspace is open. */
function Elsewhere() {
  const workspaces = useWorkspaces((s) => s.workspaces) ?? [];
  const select = useWorkspaces((s) => s.select);
  const mine = workspaces.filter((w) => w.type === MINOR_MINERALS);
  return (
    <div className="p-10">
      <EmptyState
        icon={MountainIcon}
        title="Minor minerals lives in its own workspaces."
        description={
          mine.length
            ? "Open one to see its leases, missions and studies."
            : "Make one from the workspace menu: New workspace, then choose river sand and minor minerals."
        }
        action={
          mine.length ? (
            <div className="flex flex-wrap justify-center gap-2">
              {mine.map((w) => (
                <Button key={w.id} variant="ghost" onClick={() => void select(w.id)}>
                  {w.name}
                </Button>
              ))}
            </div>
          ) : undefined
        }
        framed
      />
    </div>
  );
}

/** Every minor-minerals screen renders inside this. Nothing of the extension shows to an unlicensed organisation, and
 * lists show only inside a minor-minerals workspace, remounting when another one opens. A record's own page
 * (`anyWorkspace`) opens wherever its link was followed and moves to its site's workspace itself. */
export function MMGate({ children, anyWorkspace = false }: { children: ReactNode; anyWorkspace?: boolean }) {
  const loaded = useOrganisation((s) => s.organisation !== null);
  const workspacesLoaded = useWorkspaces((s) => s.workspaces !== null);
  const currentId = useWorkspaces((s) => s.currentId);
  const licensed = useMinorMineralsLicence();
  const here = useMinorMinerals();
  if (!loaded || (!anyWorkspace && !workspacesLoaded)) return <Loader label="Loading" />;
  if (!licensed)
    return (
      <div className="p-10">
        <EmptyState icon={MountainIcon} title="Minor minerals isn’t switched on for this organisation." description="Ask Orblode to turn it on." framed />
      </div>
    );
  if (anyWorkspace) return <>{children}</>;
  if (!here) return <Elsewhere />;
  return <Fragment key={currentId}>{children}</Fragment>;
}

/** Opens the site's workspace when the person reached one of its records from another. */
export function useFollowSite(siteId: string | null | undefined) {
  useEffect(() => {
    if (!siteId) return;
    const { sites, follow } = useWorkspaces.getState();
    if (sites?.some((s) => s.id === siteId)) return;
    getProject(siteId)
      .then((site) => follow(site))
      .catch(() => undefined);
  }, [siteId]);
}

type Pill = { tone: ChipTone; glyph: GlyphShape; label: string };

const pill = (tone: ChipTone, glyph: GlyphShape, label: string): Pill => ({ tone, glyph, label });

export const LEASE_STATUS: Record<string, Pill> = {
  draft: pill("neutral", "circle-dashed", "Draft"),
  submitted: pill("blue", "circle-half", "Submitted"),
  registered: pill("teal", "check", "Registered"),
};

export const MISSION_STATUS: Record<string, Pill> = {
  draft: pill("neutral", "circle-dashed", "Draft"),
  returned: pill("red", "redo", "Returned"),
  issued: pill("blue", "circle-half", "Issued"),
  accepted: pill("blue", "circle-half", "Accepted by vendor"),
  flown: pill("amber", "triangle", "Flown, not uploaded"),
  received: pill("teal", "check", "Data received"),
};

export const REPORT_STATUS: Record<string, Pill> = {
  draft: pill("neutral", "circle-dashed", "Draft"),
  in_review: pill("amber", "circle-half", "In review"),
  returned: pill("red", "redo", "Returned"),
  vetted: pill("teal", "check", "Vetted"),
  superseded: pill("neutral", "square", "Superseded"),
};

export const GNSS_STATUS: Record<string, Pill> = {
  draft: pill("neutral", "circle-dashed", "Draft"),
  queued: pill("blue", "circle-half", "Running"),
  completed: pill("teal", "check", "Completed"),
  failed: pill("red", "cross", "Failed"),
};

export const CHECK_STATE: Record<string, Pill> = {
  ok: pill("teal", "check", "Pass"),
  warn: pill("amber", "triangle", "Warning"),
  no: pill("red", "cross", "Fail"),
};

export const SOLUTION: Record<string, Pill> = {
  fixed: pill("teal", "check", "Fixed"),
  float: pill("amber", "triangle", "Float"),
  single: pill("red", "cross", "Single"),
};

export const VERDICT: Record<string, Pill> = {
  sustainable: pill("teal", "check", "Sustainable"),
  reduce: pill("amber", "triangle", "Reduce"),
  no_deposition: pill("red", "cross", "No replenishment"),
};

export function StatusChip({ map, value, label }: { map: Record<string, Pill>; value: string; label?: string }) {
  const p = map[value] ?? pill("neutral", "dot", value);
  return (
    <Chip tone={p.tone} glyph={p.glyph}>
      {label ?? p.label}
    </Chip>
  );
}

const STAGE_COLOR = { done: "bg-[var(--color-teal-500,#2e7d4f)]", current: "bg-[var(--color-amber-500,#b7791f)]", waiting: "bg-hairline" };

/** The six stages of a lease as a row of bars, done, current and waiting. */
export function Stages({ stages }: { stages: { key: string; label: string; state: "done" | "current" | "waiting" }[] }) {
  return (
    <span className="inline-flex gap-[3px]" aria-label={stages.map((s) => `${s.label}: ${s.state}`).join(", ")}>
      {stages.map((s) => (
        <span key={s.key} title={`${s.label}: ${s.state}`} className={`inline-block h-2 w-4 rounded-[2px] ${STAGE_COLOR[s.state]}`} />
      ))}
    </span>
  );
}

/** A labelled figure for a KPI row. */
export function Figure({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-md border border-hairline bg-surface px-4 py-3">
      <div className="caption uppercase tracking-wide text-ink-4">{label}</div>
      <div className="mt-1 text-[24px] font-semibold leading-tight text-ink-1 tabular-nums">{value}</div>
      {note && <div className="caption mt-1 text-ink-4">{note}</div>}
    </div>
  );
}

export function Figures({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">{children}</div>;
}

/** Loads the caller's permissions on a site so `useMay` can answer for it. */
export function useSitePermissionsLoad(siteId: string | null | undefined) {
  useEffect(() => {
    if (siteId) void useSitePermissions.getState().load(siteId);
  }, [siteId]);
}
