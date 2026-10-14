"use client";

import {
  ArrowRight01Icon,
  CubeIcon,
  Download01Icon,
  File01Icon,
  FileZipIcon,
  Folder01Icon,
  GridViewIcon,
  Image01Icon,
  Link04Icon,
  ListViewIcon,
  MapsIcon,
  MountainIcon,
} from "@hugeicons/core-free-icons";
import { Avatar, Badge, Button, Icon, IconButton, SegmentedControl, toast, type IconDefinition } from "@puckoops/camelot";
import Link from "next/link";
import { StateChip } from "@/components/common/StateChip";
import { canonicalUrl, downloadUrl } from "@/lib/files";
import { PENDING_UPLOAD } from "@/lib/status";
import { dayDate, exactTime, isEpochMs } from "@/lib/time";
import { usePerson } from "./people";
import type { FileEntry, Stamp } from "./tree";
import type { ViewMode } from "./viewMode";

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function fileIcon(filename: string): IconDefinition {
  switch (ext(filename)) {
    case "jpg":
    case "jpeg":
    case "png":
      return Image01Icon;
    case "tif":
    case "tiff":
      return MountainIcon;
    case "las":
    case "laz":
      return CubeIcon;
    case "dxf":
    case "shp":
    case "geojson":
    case "json":
    case "xml":
      return MapsIcon;
    case "zip":
      return FileZipIcon;
    default:
      return File01Icon;
  }
}

export function formatBytes(n?: number): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} KB`;
  return `${n} B`;
}

export function fileCount(n: number): string {
  return `${n} file${n === 1 ? "" : "s"}`;
}

async function copyUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("File URL copied");
  } catch {
    toast.error("Could not copy URL");
  }
}

/** A folder with the asset type it holds drawn on its front. */
export function FolderGlyph({ type, size = 36 }: { type: IconDefinition; size?: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center text-ink-3" style={{ width: size, height: size }}>
      <Icon icon={Folder01Icon} size={size} strokeWidth={1.25} />
      <Icon icon={type} size={Math.round(size * 0.38)} strokeWidth={1.75} className="absolute top-[56%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-ink-1" />
    </span>
  );
}

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (next: ViewMode) => void }) {
  return (
    <SegmentedControl<ViewMode>
      aria-label="Show as"
      value={value}
      onValueChange={onChange}
      options={[
        {
          value: "grid",
          label: (
            <span className="inline-flex items-center gap-1.5">
              <Icon icon={GridViewIcon} size={16} />
              Grid
            </span>
          ),
        },
        {
          value: "list",
          label: (
            <span className="inline-flex items-center gap-1.5">
              <Icon icon={ListViewIcon} size={16} />
              List
            </span>
          ),
        },
      ]}
    />
  );
}

export interface FolderItem {
  key: string;
  href: string;
  label: string;
  type: IconDefinition;
  count: number;
  bytes: number;
}

/** Folders as tiles on a well, or as rows straight on the card. */
export function Folders({ folders, view }: { folders: FolderItem[]; view: ViewMode }) {
  if (view === "list") {
    const sized = folders.some((f) => f.bytes > 0);
    return (
      <ul>
        {folders.map((f, i) => (
          <li key={f.key} className={i > 0 ? "border-t border-hairline" : ""}>
            <FolderRow folder={f} sized={sized} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-2 bg-canvas p-3 sm:grid-cols-2 md:grid-cols-3">
      {folders.map((f) => (
        <li key={f.key}>
          <FolderTile folder={f} />
        </li>
      ))}
    </ul>
  );
}

function FolderTile({ folder }: { folder: FolderItem }) {
  const size = formatBytes(folder.bytes);
  return (
    <Link
      href={folder.href}
      className="flex items-center gap-3 rounded-md border border-hairline bg-surface px-3 py-2.5 transition-colors hover:border-hairline-strong hover:bg-surface-2"
    >
      <FolderGlyph type={folder.type} />
      <span className="min-w-0 flex-1">
        <span className="small block truncate font-medium text-ink-1">{folder.label}</span>
        <span className="num-sm block truncate text-ink-4">{[fileCount(folder.count), size].filter(Boolean).join(" · ")}</span>
      </span>
    </Link>
  );
}

function FolderRow({ folder, sized }: { folder: FolderItem; sized: boolean }) {
  return (
    <Link href={folder.href} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-2">
      <FolderGlyph type={folder.type} size={28} />
      <span className="small min-w-0 flex-1 truncate font-medium text-ink-1">{folder.label}</span>
      <span className="num-sm w-16 shrink-0 text-right text-ink-4">{fileCount(folder.count)}</span>
      {sized && <span className="num-sm hidden w-20 shrink-0 text-right text-ink-4 sm:block">{formatBytes(folder.bytes) ?? "—"}</span>}
      <Icon icon={ArrowRight01Icon} size={16} className="shrink-0 text-ink-4" />
    </Link>
  );
}

export function Files({ entries, view }: { entries: FileEntry[]; view: ViewMode }) {
  if (view === "list") {
    return (
      <ul className="overflow-hidden rounded-md border border-hairline bg-surface">
        {entries.map((e, i) => (
          <FileRow key={e.id} entry={e} last={i === entries.length - 1} />
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {entries.map((e) => (
        <FileTile key={e.id} entry={e} />
      ))}
    </ul>
  );
}

const fileMeta = (entry: FileEntry) => [formatBytes(entry.sizeBytes), entry.crs].filter(Boolean).join(" · ") || "—";

const stampDate = (stamp?: Stamp) => (stamp && isEpochMs(stamp.at) ? dayDate(stamp.at) : null);

/** Who added the file and when, then who last edited it, as the people on this page know them. */
function useHistory(entry: FileEntry) {
  const addedBy = usePerson(entry.added.by);
  const editedBy = usePerson(entry.edited?.by);
  const addedOn = stampDate(entry.added);
  const editedOn = stampDate(entry.edited);
  const exact = (verb: string, stamp: Stamp | undefined, who: string | undefined) =>
    stamp && (isEpochMs(stamp.at) || who) ? [verb, isEpochMs(stamp.at) ? exactTime(stamp.at) : null, who ? `by ${who}` : null].filter(Boolean).join(" ") : null;
  return {
    addedBy,
    addedOn,
    edited: editedBy || editedOn ? [`Edited ${editedOn ?? ""}`.trim(), editedBy ? `by ${editedBy.label}` : null].filter(Boolean).join(" ") : null,
    title: [exact("Added", entry.added, addedBy?.label), exact("Edited", entry.edited, editedBy?.label)].filter(Boolean).join("\n") || undefined,
  };
}

function FileRow({ entry, last }: { entry: FileEntry; last: boolean }) {
  const { addedBy, addedOn, edited, title } = useHistory(entry);
  return (
    <li className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-2 ${last ? "" : "border-b border-hairline"}`}>
      <Icon icon={fileIcon(entry.name)} size={16} className="shrink-0 text-ink-4" />
      <div className="min-w-0 flex-1">
        <p className="small truncate text-ink-1">{entry.name}</p>
        <p className="num-sm truncate text-ink-4">{[fileMeta(entry), edited].filter(Boolean).join(" · ")}</p>
        {(addedOn || addedBy) && (
          <p className="num-sm truncate text-ink-4 sm:hidden">{[addedOn && `Added ${addedOn}`, addedBy && `by ${addedBy.label}`].filter(Boolean).join(" ")}</p>
        )}
      </div>
      {entry.tag && <Badge variant="tag">{entry.tag.replace(/_/g, " ")}</Badge>}
      <div className="hidden w-44 shrink-0 items-center gap-2 sm:flex" title={title}>
        {addedBy && <Avatar name={addedBy.name} src={addedBy.avatar} size={20} />}
        <div className="min-w-0">
          <p className="small truncate text-ink-2">{addedBy?.label ?? "Unknown"}</p>
          <p className="num-sm truncate text-ink-4">{addedOn ? `Added ${addedOn}` : "—"}</p>
        </div>
      </div>
      <FileActions entry={entry} />
    </li>
  );
}

function FileTile({ entry }: { entry: FileEntry }) {
  return (
    <li className="flex flex-col gap-3 rounded-md border border-hairline bg-surface p-3 transition-colors hover:border-hairline-strong hover:bg-surface-2">
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-2">
          <Icon icon={fileIcon(entry.name)} size={20} />
        </span>
        <FileActions entry={entry} />
      </div>
      <div className="min-w-0">
        <p className="small line-clamp-2 text-ink-1 wrap-anywhere" title={entry.name}>
          {entry.name}
        </p>
        <p className="num-sm mt-0.5 truncate text-ink-4">{fileMeta(entry)}</p>
      </div>
      {entry.tag && (
        <Badge variant="tag" className="self-start">
          {entry.tag.replace(/_/g, " ")}
        </Badge>
      )}
      <TileHistory entry={entry} />
    </li>
  );
}

function TileHistory({ entry }: { entry: FileEntry }) {
  const { addedBy, addedOn, edited, title } = useHistory(entry);
  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-hairline pt-2.5" title={title}>
      <div className="flex items-center gap-2">
        {addedBy && <Avatar name={addedBy.name} src={addedBy.avatar} size={20} />}
        <p className="caption min-w-0 truncate text-ink-4">
          <span className="text-ink-2">{addedBy?.label ?? "Unknown"}</span>
          {addedOn && ` · Added ${addedOn}`}
        </p>
      </div>
      {edited && <p className="caption truncate text-ink-4">{edited}</p>}
    </div>
  );
}

function FileActions({ entry }: { entry: FileEntry }) {
  const { name, pending, url } = entry;
  if (pending) return <StateChip state={PENDING_UPLOAD} />;
  const href = downloadUrl(url);
  const share = canonicalUrl(url);
  return (
    <div className="flex shrink-0 items-center gap-1">
      {share && <IconButton icon={Link04Icon} aria-label="Copy file URL" variant="bare" size="sm" onClick={() => copyUrl(share)} />}
      {href ? (
        <Button asChild variant="quiet" size="sm">
          <a href={href} download={name} title={`Download ${name}`}>
            <Icon icon={Download01Icon} size={16} />
            <span className="visually-hidden">Download {name}</span>
          </a>
        </Button>
      ) : (
        <IconButton icon={Download01Icon} aria-label="No downloadable object for this entry" variant="bare" size="sm" disabled />
      )}
    </div>
  );
}
