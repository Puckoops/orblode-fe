"use client";

import { Delete02Icon, Location01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { Button, HelperText, IconButton, Input, Select } from "@puckoops/camelot";
import { useEffect, useMemo, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { createNogo, deleteNogo, listNogo, type GeoJSONGeometry, type NogoFeature, type NogoType } from "@/lib/api/mm";
import { circle, NOGO_TYPES } from "@/lib/mm/nogo";
import { toast } from "@/lib/toast";
import { useMmOverlay, useMmPointPick, useMmPolygonDraw, type Overlay } from "./useMmScene";

// Polygon kinds are zones; the rest are things on the bank, placed with one click.
const ZONES: NogoType[] = ["airspace_yellow", "airspace_red", "other"];
const SHOWN_RADIUS_M = 15;

/** A site's keep-away places on the viewer's scene: bridges, intake wells and habitations placed with a click, airspace
 * and other zones drawn, each with the distance missions and extraction keep from it. */
export function KeepAwayPlaces({ projectId, editable }: { projectId: string; editable: boolean }) {
  const [features, setFeatures] = useState<NogoFeature[]>([]);
  const [type, setType] = useState<NogoType>("bridge");
  const [name, setName] = useState("");
  const [keep, setKeep] = useState(String(NOGO_TYPES.bridge.keep ?? ""));

  useEffect(() => {
    let live = true;
    listNogo(projectId)
      .then((list) => live && setFeatures(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [projectId]);

  const overlays = useMemo<Overlay[]>(
    () =>
      features.flatMap((f) => {
        if (f.geometry.type !== "Point") return [{ id: f.id, geometry: f.geometry, line: "#e5484d", fill: "rgba(229,72,77,0.12)" }];
        const [lon, lat] = f.geometry.coordinates as [number, number];
        return [
          { id: f.id, geometry: circle(lon, lat, SHOWN_RADIUS_M), line: "#e5484d", fill: "rgba(229,72,77,0.5)" },
          ...(f.keep_m ? [{ id: `${f.id}-keep`, geometry: circle(lon, lat, f.keep_m), line: "#e5484d", width: 1 }] : []),
        ];
      }),
    [features]
  );
  useMmOverlay(overlays);

  const add = async (geometry: GeoJSONGeometry) => {
    try {
      const keepM = keep.trim() === "" ? undefined : Number(keep);
      const made = await createNogo({ project_id: projectId, type, name: name.trim() || NOGO_TYPES[type].label, keep_m: keepM, geometry });
      setFeatures((list) => [...list, made]);
      setName("");
      toast.success(`${made.name} added.`);
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't add the place."));
    }
  };
  const point = useMmPointPick((at) => void add({ type: "Point", coordinates: [at.lon, at.lat] }));
  const zone = useMmPolygonDraw((ring) => void add({ type: "Polygon", coordinates: [[...ring.map((p) => [p.lon, p.lat]), [ring[0].lon, ring[0].lat]]] }));
  const isZone = ZONES.includes(type);

  const remove = async (f: NogoFeature) => {
    try {
      await deleteNogo(projectId, f.id);
      setFeatures((list) => list.filter((x) => x.id !== f.id));
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't remove the place."));
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="small font-semibold text-ink-1">Keep-away places</h3>
      {features.length === 0 && <HelperText>None on this site.</HelperText>}
      {features.map((f) => (
        <div key={f.id} className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="small block truncate text-ink-1">{f.name}</span>
            <span className="caption text-ink-4">
              {NOGO_TYPES[f.type]?.label ?? f.type}
              {f.keep_m ? ` · keep ${f.keep_m} m away` : ""}
            </span>
          </span>
          {editable && <IconButton icon={Delete02Icon} aria-label={`Remove ${f.name}`} variant="bare" size="sm" onClick={() => void remove(f)} />}
        </div>
      ))}
      {editable &&
        (point.picking || zone.drawing ? (
          <div className="flex flex-col gap-2 rounded-md border border-hairline p-2">
            <span className="caption text-ink-3">
              {point.picking
                ? "Click the place on the scene. Escape stops."
                : `Click the zone's corners on the scene (${zone.count} so far). Double-click or Enter closes it; Escape stops.`}
            </span>
            <div className="flex gap-2">
              {zone.drawing && (
                <Button size="sm" variant="primary" disabled={zone.count < 3} onClick={zone.finish}>
                  Finish
                </Button>
              )}
              <Button size="sm" variant="quiet" onClick={point.picking ? point.cancel : zone.cancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Select
                aria-label="Kind of place"
                value={type}
                onValueChange={(v) => {
                  setType(v as NogoType);
                  setKeep(NOGO_TYPES[v as NogoType].keep?.toString() ?? "");
                }}
                options={Object.entries(NOGO_TYPES).map(([value, t]) => ({ value, label: t.label }))}
              />
              <Input aria-label="Keep-away distance (m)" inputMode="decimal" value={keep} onChange={(e) => setKeep(e.target.value)} placeholder="Keep (m)" />
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input aria-label="Name of the place" value={name} onChange={(e) => setName(e.target.value)} placeholder={NOGO_TYPES[type].label} />
              <Button size="sm" variant="ghost" iconStart={isZone ? PencilEdit02Icon : Location01Icon} onClick={isZone ? zone.start : point.start}>
                {isZone ? "Draw" : "Place"}
              </Button>
            </div>
          </div>
        ))}
    </section>
  );
}
