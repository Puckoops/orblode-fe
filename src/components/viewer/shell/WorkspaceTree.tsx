"use client";

// WorkspaceTree (viewer-shell §6.3 / §4.2) — the `measure` module's zone-2
// content. Structure comes from the `TreeSource` seam (§6.1): 1.6 swapped in
// `folderApiTreeSource` (asset-svc folders backend, §6.2) — real folder CRUD
// (create / inline-rename / delete) and native HTML5 drag-and-drop: drag a
// measurement onto a folder to group it (root/Ungrouped = ungroup), drag a
// folder onto a folder to nest it (root = promote to workspace). Cycle/depth
// guards run client-side (canDropFolder) and again server-side (§6.2).
// When the folders backend is unreachable the source degrades to the legacy
// read-only folder-string tree and every folder affordance hides.
//
// Row/status behaviors are ported from MeasurementPanel: status dots,
// result-suffixed labels, hover compute/delete actions, demo badges, sort +
// filter + collapse-all toolbar, and the server-debounced search box. (The
// quick-draw polygon/polyline buttons were removed — the floating canvas
// toolbar owns drawing.)

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight01Icon,
  ArrowUpDownIcon,
  Delete02Icon,
  EyeIcon,
  EyeOffIcon,
  FilterIcon,
  Folder01Icon,
  FolderPlusIcon,
  FolderTreeIcon,
  FoldVerticalIcon,
  PencilIcon,
  PlayIcon,
  RefreshIcon,
  RulerIcon,
} from "@hugeicons/core-free-icons";
import { Badge, Chip, EmptyState, Glyph, Icon, IconButton, Input, ProgressCircle, SearchInput, Tooltip, type IconDefinition } from "@puckoops/camelot";
import { Collapsible } from "radix-ui";
import { toast } from "@/lib/toast";

import { useConfirm } from "@/components/common/confirm";
import { measurementDeleteRequest } from "@/components/viewer/deleteConfirm";
import {
  canDropFolder,
  findNode,
  folderMembership,
  nextFolderName,
  MAX_FOLDER_DEPTH,
  type WorkspaceTreeNode,
} from "@/lib/viewer/workspaceTree";
import { folderApiTreeSource } from "@/lib/viewer/folderTreeSource";
import {
  createFolder,
  deleteFolder,
  updateFolder,
  updateFolderItems,
} from "@/lib/api/orblodeSvc";
import {
  isMeasurementVisibleOnCanvas,
  useViewerStore,
} from "@/lib/viewer/state/store";
import { useViewerActions } from "@/components/viewer/shell/viewerActions";
import { useInteractionActor } from "@/components/viewer/shell/interactionContext";
import { useSelector } from "@xstate/react";
import { isComputeStuck, metricsOf, resultForKind } from "@/lib/viewer/calc";
import { useComputeClock } from "@/components/viewer/shell/hooks/useComputeClock";
import type { PanelMeasurement } from "@/lib/viewer/sampleData";
import { measurementState } from "@/lib/status";

/** Single-line row label, e.g. "SP-01 · 14,820 m³" (ported from
 * MeasurementPanel). total_* keys are what the stockpile compute emits; the
 * bare keys cover client-side plan stats and future per-pile results. */
function measurementLabel(m: PanelMeasurement): string {
  if (m.demo) return m.name;
  // The CURRENT kind's stored doc (per-kind results map; legacy fallback) —
  // the label always matches what the inspector shows for this type.
  const r = metricsOf(m.demo ? m.result : resultForKind(m));
  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (r) {
    const volume =
      r.total_volume_m3 ?? r.total_adjusted_volume_m3 ?? r.volume_m3 ?? r.adjusted_volume_m3;
    if (typeof volume === "number") return `${m.name} · ${fmt(volume)} m³`;
    if (typeof r.area_m2 === "number") return `${m.name} · ${fmt(r.area_m2)} m²`;
    const length = r.profile_length_m ?? r.length_m;
    if (typeof length === "number") return `${m.name} · ${fmt(length)} m`;
  }
  return m.name;
}

/** Compute state as its glyph, in ink: computing, failed or not yet computed (completed rows show none). */
function StatusGlyph({ status }: { status: string }) {
  const state = measurementState(status);
  return (
    <span className="flex shrink-0 text-ink-3" title={state.label}>
      <Glyph shape={state.glyph} aria-label={state.label} />
    </span>
  );
}

/** A small icon action inside a dense tree row. */
function RowAction({
  icon,
  label,
  onClick,
  disabled,
  busy,
  className,
}: {
  icon: IconDefinition;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
}) {
  if (busy) return <ProgressCircle value={null} size="sm" aria-label={`${label}…`} />;
  return (
    <Tooltip content={label}>
      <IconButton icon={icon} aria-label={label} variant="bare" size="sm" disabled={disabled} onClick={onClick} className={`size-5 ${className ?? ""}`} />
    </Tooltip>
  );
}

function ToolbarButton({ label, icon, active, onClick }: { label: string; icon: IconDefinition; active?: boolean; onClick: () => void }) {
  return (
    <Tooltip content={label}>
      <IconButton
        icon={icon}
        aria-label={label}
        aria-pressed={active}
        size="sm"
        variant="bare"
        onClick={onClick}
        className={active ? "border-hairline bg-emphasis-quiet text-ink-1" : undefined}
      />
    </Tooltip>
  );
}

function subtreeCount(node: WorkspaceTreeNode): number {
  return node.itemIds.length + node.children.reduce((acc, c) => acc + subtreeCount(c), 0);
}

function collectNodeIds(nodes: WorkspaceTreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    out.push(n.id);
    collectNodeIds(n.children, out);
  }
  return out;
}

/** All measurement ids under a folder/workspace (direct + nested). */
function collectSubtreeItemIds(node: WorkspaceTreeNode): string[] {
  const ids = [...node.itemIds];
  for (const child of node.children) ids.push(...collectSubtreeItemIds(child));
  return ids;
}

/** Nested folders beneath a node, excluding the node itself — deleteFolder is a
 * HARD delete that cascades to them (orblodeSvc deleteFolder), so the
 * confirmation has to state how many go with it. */
function countDescendantFolders(node: WorkspaceTreeNode): number {
  return node.children.reduce((acc, c) => acc + 1 + countDescendantFolders(c), 0);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What's being dragged (set at dragstart, same-window only — dataTransfer
 * payloads are unreadable during dragover, so guards read this instead). */
interface DragPayload {
  kind: "measurement" | "folder";
  id: string;
}

interface DndHandlers {
  ready: boolean;
  dropTargetId: string | null;
  startMeasurement: (e: React.DragEvent, id: string) => void;
  startFolder: (e: React.DragEvent, node: WorkspaceTreeNode) => void;
  end: () => void;
  overNode: (e: React.DragEvent, node: WorkspaceTreeNode) => void;
  leaveNode: (node: WorkspaceTreeNode) => void;
  dropNode: (e: React.DragEvent, node: WorkspaceTreeNode) => void;
}

interface FolderOps {
  ready: boolean;
  renamingId: string | null;
  create: (parent: WorkspaceTreeNode | null) => void;
  renameStart: (id: string) => void;
  renameCommit: (node: WorkspaceTreeNode, name: string) => void;
  renameCancel: () => void;
  remove: (node: WorkspaceTreeNode) => void;
}

function MeasurementRow({
  m,
  busy,
  visible,
  stuck,
  dnd,
  onSelect,
  onCompute,
  onForceCompute,
  onDelete,
  onToggleVisible,
}: {
  m: PanelMeasurement;
  busy: boolean;
  visible: boolean;
  /** Has been `computing` past the stuck threshold (ORB-39). */
  stuck: boolean;
  dnd: DndHandlers;
  onSelect: (m: PanelMeasurement) => void;
  onCompute: (id: string) => void;
  onForceCompute: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleVisible: (id: string, visible: boolean) => void;
}) {
  const canCompute = m.status === "draft" || m.status === "failed";
  const showDot = !m.demo && m.status !== "completed";
  const draggable = dnd.ready && !m.demo;
  return (
    <div
      data-m-id={m.id}
      draggable={draggable}
      onDragStart={draggable ? (e) => dnd.startMeasurement(e, m.id) : undefined}
      onDragEnd={draggable ? dnd.end : undefined}
      title={draggable ? "Drag onto a folder to group" : undefined}
      className={`group flex h-7 items-center gap-2 rounded-xs px-2 ${visible ? "bg-emphasis-quiet" : "hover:bg-surface-2"} ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
    >
      {showDot && <StatusGlyph status={m.status} />}
      <button
        type="button"
        onClick={() => onSelect(m)}
        title="Inspect measurement"
        className={`caption min-w-0 flex-1 truncate text-left ${visible ? "font-medium text-ink-1" : "text-ink-4 hover:text-ink-2"}`}
      >
        {measurementLabel(m)}
      </button>
      {m.draft && !m.demo && (
        <Chip tone="amber" glyph="circle-dashed" title="Draft — save it from the inspector to keep it" className="shrink-0">
          Draft
        </Chip>
      )}
      {m.demo && (
        <Badge variant="tag" title="Sample data — not from this survey" className="shrink-0">
          Demo
        </Badge>
      )}
      {!m.demo && (
        <RowAction
          icon={visible ? EyeIcon : EyeOffIcon}
          label={visible ? "Hide on viewer" : "Show on viewer"}
          onClick={() => onToggleVisible(m.id, !visible)}
          className={visible ? "text-ink-1" : undefined}
        />
      )}
      {!m.demo && (
        <div className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
          {canCompute && <RowAction icon={PlayIcon} label="Compute" busy={busy} onClick={() => onCompute(m.id)} />}
          {/* ORB-39: a compute stuck past the threshold gets a force re-run here
              too — the ordinary Play button above is hidden for `computing`. */}
          {stuck && (
            <RowAction icon={RefreshIcon} label="This compute looks stuck — force a re-run" busy={busy} onClick={() => onForceCompute(m.id)} />
          )}
          <RowAction icon={Delete02Icon} label="Delete" disabled={busy} onClick={() => onDelete(m.id)} />
        </div>
      )}
    </div>
  );
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const committed = useRef(false);
  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    onCommit(value);
  };
  return (
    <Input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          committed.current = true;
          onCancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label="Folder name"
      className="h-6 min-w-0 flex-1 px-1.5"
    />
  );
}

function TreeNode({
  node,
  level,
  byId,
  sortRecent,
  busyIds,
  collapsed,
  visibility,
  now,
  folderOps,
  dnd,
  onToggle,
  onSelect,
  onCompute,
  onForceCompute,
  onDelete,
  onToggleVisible,
  onToggleFolderVisible,
}: {
  node: WorkspaceTreeNode;
  level: number;
  byId: Map<string, PanelMeasurement>;
  sortRecent: boolean;
  busyIds: Set<string>;
  collapsed: Set<string>;
  visibility: Record<string, boolean>;
  /** Clock for the stuck-compute check (ORB-39). */
  now: number;
  folderOps: FolderOps;
  dnd: DndHandlers;
  onToggle: (id: string) => void;
  onSelect: (m: PanelMeasurement) => void;
  onCompute: (id: string) => void;
  onForceCompute: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleVisible: (id: string, visible: boolean) => void;
  onToggleFolderVisible: (ids: string[]) => void;
}) {
  const open = !collapsed.has(node.id);
  const isWorkspace = node.kind === "workspace";
  const nodeIcon = isWorkspace ? FolderTreeIcon : Folder01Icon;
  // Real backend folders get CRUD affordances + are draggable; the pinned
  // root and Ungrouped are client-side fixtures.
  const isReal = !node.synthetic && folderOps.ready;
  const renaming = folderOps.renamingId === node.id;
  const isDropTarget = dnd.dropTargetId === node.id;

  // Resolve + sort this node's direct items. Default sorts by name; the
  // toggle switches to most-recently-updated first (ported behavior).
  const items = node.itemIds
    .map((id) => byId.get(id))
    .filter((m): m is PanelMeasurement => Boolean(m))
    .sort((a, b) =>
      sortRecent ? b.updated_at.localeCompare(a.updated_at) : a.name.localeCompare(b.name)
    );

  // Folder eye covers every non-demo measurement in the subtree.
  const subtreeIds = collectSubtreeItemIds(node);
  const toggleableIds = subtreeIds.filter((id) => {
    const m = byId.get(id);
    return m && !m.demo;
  });
  const anyVisible = toggleableIds.some(
    (id) => byId.get(id) != null && isMeasurementVisibleOnCanvas(byId.get(id)!, visibility)
  );
  const folderEyeActive = toggleableIds.length > 0 && anyVisible;

  return (
    <Collapsible.Root open={open} onOpenChange={() => onToggle(node.id)}>
      <div
        data-node-id={node.id}
        draggable={isReal && dnd.ready && !renaming}
        onDragStart={isReal ? (e) => dnd.startFolder(e, node) : undefined}
        onDragEnd={isReal ? dnd.end : undefined}
        onDragOver={(e) => dnd.overNode(e, node)}
        onDragLeave={() => dnd.leaveNode(node)}
        onDrop={(e) => dnd.dropNode(e, node)}
        className={`group flex h-8 w-full items-center gap-1.5 rounded-xs px-2 ${
          isDropTarget ? "bg-emphasis-quiet ring-1 ring-hairline-strong ring-inset" : "hover:bg-surface-2"
        }`}
        style={{ paddingLeft: `${8 + level * 14}px` }}
      >
        <Collapsible.Trigger className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <Icon icon={ArrowRight01Icon} size={16} className={`shrink-0 text-ink-4 transition-transform ${open ? "rotate-90" : ""}`} />
          <Icon icon={nodeIcon} size={16} className="shrink-0 text-ink-4" />
          {renaming ? (
            <RenameInput initial={node.name} onCommit={(name) => folderOps.renameCommit(node, name)} onCancel={folderOps.renameCancel} />
          ) : (
            <span
              className={`caption min-w-0 flex-1 truncate text-left ${
                isWorkspace ? "font-medium text-ink-1" : folderEyeActive ? "text-ink-1" : "text-ink-3"
              }`}
            >
              {node.name}
            </span>
          )}
          {!renaming && <span className="num-sm shrink-0 text-ink-4">({subtreeCount(node)})</span>}
        </Collapsible.Trigger>

        {/* Folder management — real backend folders only. */}
        {isReal && !renaming && (
          <div className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
            {node.depth < MAX_FOLDER_DEPTH && (
              <RowAction
                icon={FolderPlusIcon}
                label="New subfolder"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  folderOps.create(node);
                }}
              />
            )}
            <RowAction
              icon={PencilIcon}
              label="Rename folder"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                folderOps.renameStart(node.id);
              }}
            />
            <RowAction
              icon={Delete02Icon}
              label="Delete folder (measurements move to Ungrouped)"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                folderOps.remove(node);
              }}
            />
          </div>
        )}

        {toggleableIds.length > 0 && (
          <RowAction
            icon={folderEyeActive ? EyeIcon : EyeOffIcon}
            label={folderEyeActive ? "Hide all in group" : "Show all in group"}
            className={folderEyeActive ? "text-ink-1" : undefined}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFolderVisible(toggleableIds);
            }}
          />
        )}
      </div>
      <Collapsible.Content>
        {node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            level={level + 1}
            byId={byId}
            sortRecent={sortRecent}
            busyIds={busyIds}
            collapsed={collapsed}
            visibility={visibility}
            now={now}
            folderOps={folderOps}
            dnd={dnd}
            onToggle={onToggle}
            onSelect={onSelect}
            onCompute={onCompute}
            onForceCompute={onForceCompute}
            onDelete={onDelete}
            onToggleVisible={onToggleVisible}
            onToggleFolderVisible={onToggleFolderVisible}
          />
        ))}
        <div style={{ paddingLeft: `${14 + level * 14}px` }}>
          {items.map((m) => (
            <MeasurementRow
              key={m.id}
              m={m}
              busy={busyIds.has(m.id)}
              visible={isMeasurementVisibleOnCanvas(m, visibility)}
              stuck={!m.demo && isComputeStuck(m, now)}
              dnd={dnd}
              onSelect={onSelect}
              onCompute={onCompute}
              onForceCompute={onForceCompute}
              onDelete={onDelete}
              onToggleVisible={onToggleVisible}
            />
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function WorkspaceTree() {
  const measurements = useViewerStore((s) => s.measurements);
  const measurementVisibility = useViewerStore((s) => s.measurementVisibility);
  const measurementSearch = useViewerStore((s) => s.measurementSearch);
  const searchingMeasurements = useViewerStore((s) => s.searchingMeasurements);
  const drawMode = useViewerStore((s) => s.drawMode);
  // v2: reshaping an existing measurement mirrors drawMode too, so the drawing
  // hint below would read wrong — swap to edit guidance when the machine says so.
  const interactionActor = useInteractionActor();
  const isEditingGeometry = useSelector(
    interactionActor,
    (s) => typeof s.value === "object" && s.value !== null && "editing" in s.value
  );
  const busyIds = useViewerStore((s) => s.busyIds);
  const projectId = useViewerStore((s) => s.manifest?.survey.project_id ?? "");
  const surveyId = useViewerStore((s) => s.surveyId);
  const setMeasurementSearch = useViewerStore((s) => s.setMeasurementSearch);
  const setMeasurementVisible = useViewerStore((s) => s.setMeasurementVisible);
  const setMeasurementsVisible = useViewerStore((s) => s.setMeasurementsVisible);
  const actions = useViewerActions();

  const [sortRecent, setSortRecent] = useState(false);
  const [completedOnly, setCompletedOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [nodes, setNodes] = useState<WorkspaceTreeNode[]>([]);
  // The UNfiltered backend workspaces (membership map, name dedupe, drop
  // guards); null = folders backend unavailable → legacy read-only tree.
  const [rawWorkspaces, setRawWorkspaces] = useState<WorkspaceTreeNode[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const dragRef = useRef<DragPayload | null>(null);
  // ORB-37: both destructive tree affordances (row trash, folder trash) route
  // through this before touching the backend.
  const { confirm, confirmDialog } = useConfirm();
  // ORB-39: ticks only while something is computing, so stuck rows can grow
  // their force-rerun affordance without any data changing.
  const now = useComputeClock(measurements.some((m) => m.status === "computing"));

  // Name search runs server-side (`measurements` already reflects the query);
  // only the completed-only filter is client-side, applied BEFORE the tree
  // builds so empty folders drop out while filtering (ported behavior).
  const visible = useMemo(
    () => (completedOnly ? measurements.filter((m) => m.status === "completed") : measurements),
    [measurements, completedOnly]
  );
  const filtering = completedOnly || measurementSearch.trim().length > 0;

  // The TreeSource seam (§6.1): folderApiTreeSource (1.6). refreshTick forces
  // a re-load after every folder mutation.
  const source = useMemo(
    () =>
      folderApiTreeSource(visible, { pruneEmpty: filtering, onRaw: setRawWorkspaces }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, filtering, refreshTick]
  );

  useEffect(() => {
    let alive = true;
    source
      .load(projectId, surveyId)
      .then((ws) => {
        if (alive) setNodes(ws);
      })
      .catch(() => {
        if (alive) setNodes([]);
      });
    return () => {
      alive = false;
    };
  }, [source, projectId, surveyId]);

  const byId = useMemo(
    () => new Map<string, PanelMeasurement>(measurements.map((m) => [m.id, m])),
    [measurements]
  );

  const allNodeIds = useMemo(() => collectNodeIds(nodes), [nodes]);
  const allCollapsed = allNodeIds.length > 0 && allNodeIds.every((id) => collapsed.has(id));

  const toggleNode = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setCollapsed(allCollapsed ? new Set() : new Set(allNodeIds));
  };

  /** Folder eye: if any saved item is visible → hide all; else show all. */
  const toggleFolderVisible = (ids: string[]) => {
    const anyOn = ids.some((id) => {
      const m = byId.get(id);
      return m ? isMeasurementVisibleOnCanvas(m, measurementVisibility) : false;
    });
    setMeasurementsVisible(ids, !anyOn);
  };

  const refresh = () => setRefreshTick((t) => t + 1);
  const mutationError = (err: unknown, fallback: string) =>
    toast.error(err instanceof Error && err.message ? err.message : fallback);

  const folderOps: FolderOps = {
    ready: rawWorkspaces !== null,
    renamingId,
    create: (parent) => {
      if (rawWorkspaces === null || !projectId) {
        toast.error("Folders are unavailable right now");
        return;
      }
      // parent === null (toolbar) → top-level; parent real → subfolder. The
      // synthetic root also means top-level (drop-created path).
      const parentReal = parent && !parent.synthetic ? parent : null;
      const siblings = parentReal
        ? (findNode(rawWorkspaces, parentReal.id)?.children ?? [])
        : rawWorkspaces;
      const name = nextFolderName(siblings);
      createFolder({
        project_id: projectId,
        parent_id: parentReal ? parentReal.id : null,
        name,
      })
        .then((created) => {
          // Reveal the new row and drop straight into rename mode.
          setCollapsed((prev) => {
            const next = new Set(prev);
            if (parentReal) next.delete(parentReal.id);
            return next;
          });
          setRenamingId(created.id);
          refresh();
        })
        .catch((err) => mutationError(err, "Could not create the folder"));
    },
    renameStart: setRenamingId,
    renameCommit: (node, name) => {
      setRenamingId(null);
      const next = name.trim();
      if (!next || next === node.name) return;
      updateFolder(node.id, { name: next })
        .then(refresh)
        .catch((err) => mutationError(err, "Could not rename the folder"));
    },
    renameCancel: () => setRenamingId(null),
    remove: (node) => {
      // deleteFolder is a HARD delete that cascades to child folders and
      // membership rows (orblodeSvc deleteFolder). Measurements survive and fall
      // back to Ungrouped — the copy says all three things explicitly, because
      // "are you sure?" would hide the cascade (ORB-37).
      const subfolders = countDescendantFolders(node);
      const grouped = collectSubtreeItemIds(node).length;
      confirm({
        title: `Delete the folder ${node.name}?`,
        description: (
          <>
            This permanently deletes the folder
            {subfolders > 0 ? (
              <>
                {" "}
                and the{" "}
                <span className="font-medium text-ink-1">{plural(subfolders, "folder", "folders")}</span>{" "}
                nested inside it
              </>
            ) : null}
            , and clears the grouping for{" "}
            <span className="font-medium text-ink-1">{plural(grouped, "measurement", "measurements")}</span>
            . The measurements themselves are not deleted — they move back to Ungrouped. This
            cannot be undone.
          </>
        ),
        confirmLabel: "Delete folder",
        onConfirm: async () => {
          try {
            await deleteFolder(node.id);
            toast.success("Folder deleted — its measurements moved to Ungrouped");
            refresh();
          } catch (err) {
            mutationError(err, "Could not delete the folder");
          }
        },
      });
    },
  };

  const moveMeasurement = async (mid: string, target: WorkspaceTreeNode) => {
    if (rawWorkspaces === null) return;
    const membership = folderMembership(rawWorkspaces).get(mid) ?? [];
    const targetReal = !target.synthetic;
    const ops: Promise<unknown>[] = [];
    if (targetReal && !membership.includes(target.id)) {
      ops.push(updateFolderItems(target.id, { add: [mid] }));
    }
    for (const fid of membership) {
      if (!targetReal || fid !== target.id) {
        ops.push(updateFolderItems(fid, { remove: [mid] }));
      }
    }
    if (ops.length === 0) return; // dropped where it already lives
    try {
      await Promise.all(ops);
      refresh();
    } catch (err) {
      mutationError(err, "Could not move the measurement");
      refresh(); // partial moves: reconcile with the backend's actual state
    }
  };

  const moveFolder = async (fid: string, target: WorkspaceTreeNode) => {
    if (rawWorkspaces === null) return;
    const dragged = findNode(rawWorkspaces, fid);
    if (!dragged || !canDropFolder(dragged, target)) return;
    try {
      await updateFolder(fid, {
        parent_id: target.synthetic === "root" ? null : target.id,
      });
      refresh();
    } catch (err) {
      mutationError(err, "Could not move the folder");
    }
  };

  const dnd: DndHandlers = {
    ready: rawWorkspaces !== null,
    dropTargetId,
    startMeasurement: (e, id) => {
      dragRef.current = { kind: "measurement", id };
      e.dataTransfer.setData("application/x-orblode-measurement", id);
      e.dataTransfer.effectAllowed = "move";
    },
    startFolder: (e, node) => {
      dragRef.current = { kind: "folder", id: node.id };
      e.dataTransfer.setData("application/x-orblode-folder", node.id);
      e.dataTransfer.effectAllowed = "move";
      e.stopPropagation();
    },
    end: () => {
      dragRef.current = null;
      setDropTargetId(null);
    },
    overNode: (e, node) => {
      const drag = dragRef.current;
      if (!drag || rawWorkspaces === null) return;
      let ok = false;
      if (drag.kind === "measurement") {
        ok = true; // folders group; root/Ungrouped ungroup
      } else {
        const dragged = findNode(rawWorkspaces, drag.id);
        ok = !!dragged && canDropFolder(dragged, node);
      }
      if (ok) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropTargetId !== node.id) setDropTargetId(node.id);
      }
    },
    leaveNode: (node) => {
      setDropTargetId((prev) => (prev === node.id ? null : prev));
    },
    dropNode: (e, node) => {
      e.preventDefault();
      e.stopPropagation();
      const drag = dragRef.current;
      dragRef.current = null;
      setDropTargetId(null);
      if (!drag) return;
      if (drag.kind === "measurement") void moveMeasurement(drag.id, node);
      else void moveFolder(drag.id, node);
    },
  };

  /** Amber refresh icon on a stuck row → re-dispatch with `force`, bypassing
   * asset-svc's compute-in-flight 409 (ORB-39). */
  const forceCompute = (id: string) => actions.triggerCompute(id, undefined, { force: true });

  /** Row trash icon → confirm, then the real delete (ORB-37). */
  const confirmRemoveMeasurement = (id: string) => {
    const m = byId.get(id);
    if (!m) return;
    confirm(
      measurementDeleteRequest({ name: m.name, draft: m.draft }, () =>
        actions.removeMeasurement(id)
      )
    );
  };

  const treeEmpty = nodes.every((n) => subtreeCount(n) === 0 && n.children.length === 0);

  return (
    <div className="flex flex-col px-2 pt-2">
      <p className="caps px-2 pt-2 pb-1 text-ink-4">Measurements</p>

      {/* Toolbar — new folder, sort, filter, collapse-all. (The floating canvas toolbar owns drawing.) */}
      <div className="flex items-center gap-1 px-1 pb-2">
        <ToolbarButton label="New folder" icon={FolderPlusIcon} onClick={() => folderOps.create(null)} />
        <ToolbarButton
          label={sortRecent ? "Sorting by recent" : "Sorting by name"}
          icon={ArrowUpDownIcon}
          active={sortRecent}
          onClick={() => setSortRecent((v) => !v)}
        />
        <ToolbarButton
          label={completedOnly ? "Showing completed only" : "Filter: completed only"}
          icon={FilterIcon}
          active={completedOnly}
          onClick={() => setCompletedOnly((v) => !v)}
        />
        <ToolbarButton label={allCollapsed ? "Expand all" : "Collapse all"} icon={FoldVerticalIcon} onClick={toggleAll} />
      </div>

      {/* Search — matching runs server-side; useMeasurementsPoll debounces
          the store's measurementSearch 300 ms and refetches. */}
      <div className="mb-1 px-1">
        <SearchInput
          value={measurementSearch}
          onChange={(e) => setMeasurementSearch(e.target.value)}
          placeholder="Search measurements…"
          aria-label="Search measurements"
          suffix={searchingMeasurements ? <ProgressCircle value={null} size="sm" aria-label="Searching" /> : undefined}
        />
      </div>

      {drawMode && (
        <p className="caption px-2 py-1.5 text-ink-4">
          {isEditingGeometry
            ? "Drag a handle to move it · click a midpoint dot to add a point · right-click an edge to open the ring. Enter or Done saves; Esc cancels."
            : "Click the globe to add vertices. Right-click to choose a calculation. Double-click to calculate. Esc discards."}
        </p>
      )}

      {/* Workspace → folders → measurements. */}
      <div className="flex flex-col pb-2">
        {treeEmpty && (
          <EmptyState
            icon={RulerIcon}
            title={measurementSearch || completedOnly ? "No measurements match." : "No measurements yet. Draw one with the tools above the map."}
          />
        )}
        {!treeEmpty &&
          nodes.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              level={0}
              byId={byId}
              sortRecent={sortRecent}
              busyIds={busyIds}
              collapsed={collapsed}
              visibility={measurementVisibility}
              now={now}
              folderOps={folderOps}
              dnd={dnd}
              onToggle={toggleNode}
              onSelect={actions.selectMeasurementRow}
              onCompute={actions.triggerCompute}
              onForceCompute={forceCompute}
              onDelete={confirmRemoveMeasurement}
              onToggleVisible={setMeasurementVisible}
              onToggleFolderVisible={toggleFolderVisible}
            />
          ))}
      </div>
      {confirmDialog}
    </div>
  );
}
