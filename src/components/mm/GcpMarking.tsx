"use client";

import { Button, ChoiceGroup, HelperText, SearchSelect } from "@puckoops/camelot";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LonLat, PhotoExif, PhotoMark } from "@/lib/api/mm";
import { candidatePhotos, type Pixel } from "@/lib/mm/photoGeometry";

export const MARKS_PER_GCP = 3;

const CROP_PX = 220;
/** Pixels of the photo the first view of a crop covers, around where the target should be. */
const WIDE = 640;
/** Pixels it covers once zoomed to place the mark. */
const NEAR = 120;

export interface MarkablePhoto {
  name: string;
  file: File;
  exif: PhotoExif;
}

export interface MarkablePoint {
  id: string;
  at: LonLat;
}

/** Marks per point, counting each photo once. */
export const markCounts = (marks: readonly PhotoMark[]) => {
  const out = new Map<string, number>();
  for (const m of marks) out.set(m.point_id, (out.get(m.point_id) ?? 0) + 1);
  return out;
};

/**
 * The vendor clicks each GCP's target in the photos that show it. The photos suggested are those whose position,
 * height and heading put the point in frame; a crop around where it should be opens, a first click zooms in and a
 * second places the mark. Photos without that information can be added by name.
 */
export function GcpMarking({
  points,
  photos,
  marks,
  onChange,
  disabled,
}: {
  points: MarkablePoint[];
  photos: MarkablePhoto[];
  marks: PhotoMark[];
  onChange: (marks: PhotoMark[]) => void;
  disabled?: boolean;
}) {
  const [pointId, setPointId] = useState(points[0]?.id ?? "");
  const [added, setAdded] = useState<Record<string, string[]>>({});
  const counts = markCounts(marks);
  const point = points.find((p) => p.id === pointId);
  const byName = useMemo(() => new Map(photos.map((p) => [p.name, p])), [photos]);

  const shown = useMemo(() => {
    if (!point) return [];
    const suggested = candidatePhotos(photos, point.at).map((c) => ({ name: c.name, at: { x: c.x, y: c.y } as Pixel | null }));
    const marked = marks.filter((m) => m.point_id === point.id).map((m) => m.photo);
    const extra = [...marked, ...(added[point.id] ?? [])].filter((n) => !suggested.some((s) => s.name === n));
    return [...suggested, ...[...new Set(extra)].map((name) => ({ name, at: null }))].filter((s) => byName.has(s.name));
  }, [point, photos, marks, added, byName]);

  const mark = (photo: string, at: Pixel | null) => {
    const rest = marks.filter((m) => !(m.point_id === pointId && m.photo === photo));
    onChange(at ? [...rest, { point_id: pointId, photo, x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100 }] : rest);
  };

  if (points.length === 0) return <HelperText>The mission has no GCPs to mark; its points are all check points.</HelperText>;
  return (
    <div className="flex flex-col gap-3">
      <ChoiceGroup
        aria-label="GCP to mark"
        look="pill"
        value={pointId}
        onValueChange={setPointId}
        options={points.map((p) => ({ value: p.id, label: `${p.id} · ${Math.min(counts.get(p.id) ?? 0, 99)}/${MARKS_PER_GCP}` }))}
      />
      <p className="caption text-ink-3">
        Click the centre of {pointId}&apos;s target: once to zoom in, again to place the mark. Mark it in at least {MARKS_PER_GCP} photos.
      </p>
      {shown.length === 0 && (
        <HelperText>No photo says it shows {pointId}. Add photos by name if they lack a position, height or lens in their EXIF.</HelperText>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {shown.map((s) => (
          <PhotoCrop
            key={`${pointId}:${s.name}`}
            photo={byName.get(s.name)!}
            expected={s.at}
            mark={marks.find((m) => m.point_id === pointId && m.photo === s.name) ?? null}
            onMark={(at) => mark(s.name, at)}
            disabled={disabled}
          />
        ))}
      </div>
      <div className="w-72">
        <SearchSelect
          placeholder="Add a photo by name"
          searchPlaceholder="Photo name"
          options={photos.filter((p) => !shown.some((s) => s.name === p.name)).map((p) => ({ value: p.name, label: p.name }))}
          value={null}
          onValueChange={(name) => setAdded((a) => ({ ...a, [pointId]: [...(a[pointId] ?? []), name] }))}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function PhotoCrop({
  photo,
  expected,
  mark,
  onMark,
  disabled,
}: {
  photo: MarkablePhoto;
  expected: Pixel | null;
  mark: PhotoMark | null;
  onMark: (at: Pixel | null) => void;
  disabled?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = photo.exif.width ?? 0;
  const height = photo.exif.height ?? 0;
  const home = mark ?? expected ?? (width && height ? { x: width / 2, y: height / 2 } : null);
  const [view, setView] = useState<{ cx: number; cy: number; size: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const region = view ?? (home ? { cx: home.x, cy: home.y, size: WIDE } : null);
  const cx = region?.cx;
  const cy = region?.cy;
  const size = region?.size;

  useEffect(() => {
    if (cx === undefined || cy === undefined || !size || !canvas.current) return;
    let live = true;
    const sx = Math.round(cx - size / 2);
    const sy = Math.round(cy - size / 2);
    createImageBitmap(photo.file, sx, sy, size, size, { resizeWidth: CROP_PX, resizeHeight: CROP_PX, resizeQuality: "high" })
      .then((bitmap) => {
        const ctx = canvas.current?.getContext("2d");
        if (!live || !ctx) return bitmap.close();
        ctx.clearRect(0, 0, CROP_PX, CROP_PX);
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        if (mark) {
          const scale = CROP_PX / size;
          const x = (mark.x - sx) * scale;
          const y = (mark.y - sy) * scale;
          ctx.strokeStyle = "#ff3b30";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x - 10, y);
          ctx.lineTo(x + 10, y);
          ctx.moveTo(x, y - 10);
          ctx.lineTo(x, y + 10);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [photo.file, cx, cy, size, mark]);

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (disabled || !region) return;
    const box = e.currentTarget.getBoundingClientRect();
    const scale = region.size / box.width;
    const at = { x: region.cx - region.size / 2 + (e.clientX - box.left) * scale, y: region.cy - region.size / 2 + (e.clientY - box.top) * scale };
    if (region.size > NEAR) setView({ cx: at.x, cy: at.y, size: NEAR });
    else {
      onMark(at);
      setView(null);
    }
  };

  return (
    <figure className="flex flex-col gap-1">
      {failed || !region ? (
        <div className="caption flex aspect-square items-center justify-center rounded-md border border-hairline bg-surface-2 p-4 text-center text-ink-3">
          {failed ? "This photo can't be shown here." : "The photo's size is unknown."}
        </div>
      ) : (
        <canvas
          ref={canvas}
          width={CROP_PX}
          height={CROP_PX}
          onClick={click}
          aria-label={`${photo.name}: ${view ? "click the target's centre to mark it" : "click near the target to zoom in"}`}
          className={`aspect-square w-full rounded-md border bg-surface-2 ${mark ? "border-accent" : "border-hairline"} ${disabled ? "" : "cursor-crosshair"}`}
        />
      )}
      <figcaption className="caption flex items-center justify-between gap-2 text-ink-3">
        <span className="min-w-0 truncate">{photo.name}</span>
        {view ? (
          <Button variant="quiet" size="sm" onClick={() => setView(null)}>
            Zoom out
          </Button>
        ) : (
          mark &&
          !disabled && (
            <Button variant="quiet" size="sm" onClick={() => onMark(null)}>
              Remove
            </Button>
          )
        )}
      </figcaption>
    </figure>
  );
}
