"use client";

import { Alert, Button, Dropzone, Field, HelperText, Input, SegmentedControl } from "@puckoops/camelot";
import { useMemo, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { setLeaseBoundary, type LeaseDetail } from "@/lib/api/mm";
import {
  boundaryAreaM2,
  BoundaryError,
  parseDxf,
  parseGeoJson,
  parseKml,
  parsePillarsCsv,
  type GridCRS,
  type ParsedBoundary,
} from "@/lib/mm/boundary";
import { thousands } from "@/lib/mm/format";
import { unzip } from "@/lib/mm/zip";
import { toast } from "@/lib/toast";
import { LazyMap } from "./LazyMap";

const ACCEPT = ".kml,.kmz,.zip,.dxf,.geojson,.json,.csv,.txt";

async function read(file: File, grid?: GridCRS): Promise<ParsedBoundary> {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "kml") return parseKml(await file.text());
  if (ext === "kmz") {
    const files = await unzip(new Uint8Array(await file.arrayBuffer()));
    const kml = [...files.entries()].find(([name]) => name.toLowerCase().endsWith(".kml"));
    if (!kml) throw new BoundaryError("The KMZ holds no KML.");
    return parseKml(new TextDecoder().decode(kml[1]));
  }
  if (ext === "zip") {
    const { default: shp } = await import("shpjs");
    const geojson = await shp(await file.arrayBuffer());
    const collections = Array.isArray(geojson) ? geojson : [geojson];
    return parseGeoJson(JSON.stringify({ type: "FeatureCollection", features: collections.flatMap((c) => (c as { features?: unknown[] }).features ?? []) }));
  }
  if (ext === "dxf") return parseDxf(await file.text(), grid);
  if (ext === "geojson" || ext === "json") return parseGeoJson(await file.text());
  return parsePillarsCsv(await file.text(), grid);
}

/** Reads a lease boundary from a file in the browser, shows it with its area against the declared one, and
 * saves it when the planner confirms. */
export function BoundaryUpload({ lease, onSaved }: { lease: LeaseDetail; onSaved: (lease: LeaseDetail) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedBoundary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsZone, setNeedsZone] = useState(false);
  const [zone, setZone] = useState("45");
  const [hemisphere, setHemisphere] = useState<"N" | "S">("N");
  const [busy, setBusy] = useState(false);

  const load = async (f: File, grid?: GridCRS) => {
    setFile(f);
    setError(null);
    setParsed(null);
    try {
      setParsed(await read(f, grid));
      setNeedsZone(false);
    } catch (err) {
      if (err instanceof BoundaryError && /UTM zone/.test(err.message)) {
        setNeedsZone(true);
        setError("This file gives eastings and northings. Choose its UTM zone, then read it again.");
      } else setError(err instanceof Error ? err.message : "The file could not be read.");
    }
  };

  const area = parsed ? boundaryAreaM2(parsed.geometry) : 0;
  const declared = lease.declared_area_ha * 1e4;
  const diff = declared > 0 ? ((area - declared) / declared) * 100 : 0;
  const areas = useMemo(() => (parsed ? [{ id: "new", kind: "lease" as const, geometry: parsed.geometry }] : []), [parsed]);

  const save = async () => {
    if (!parsed || !file) return;
    setBusy(true);
    try {
      const next = await setLeaseBoundary(lease.id, parsed.geometry, file.name, parsed.pillars);
      toast.success("Boundary saved.");
      onSaved(next);
      setParsed(null);
      setFile(null);
    } catch (err) {
      setError(refusalMessage(err, "Couldn't save the boundary. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Dropzone
        accept={ACCEPT}
        multiple={false}
        title="Drop the lease boundary here"
        hint="KML · KMZ · Shapefile (ZIP) · DXF · GeoJSON · CSV of corner pillars"
        onFiles={(files) => files[0] && void load(files[0])}
      />
      {needsZone && file && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="UTM zone">
            <Input value={zone} onChange={(e) => setZone(e.target.value)} inputMode="numeric" className="w-24" />
          </Field>
          <SegmentedControl
            aria-label="Hemisphere"
            value={hemisphere}
            onValueChange={(v) => setHemisphere(v)}
            options={[
              { value: "N", label: "North" },
              { value: "S", label: "South" },
            ]}
          />
          <Button variant="ghost" onClick={() => void load(file, { zone: Number(zone), north: hemisphere === "N" })}>
            Read again
          </Button>
        </div>
      )}
      {error && <HelperText tone="error">{error}</HelperText>}
      {parsed && (
        <>
          <LazyMap areas={areas} height={360} />
          <Alert tone={declared === 0 || Math.abs(diff) <= 1 ? "success" : "warning"} title={`${file?.name}: ${parsed.pillars} corner pillars · ${thousands(area / 1e4, 2)} ha`}>
            {declared > 0
              ? Math.abs(diff) <= 1
                ? `Agrees with the declared ${lease.declared_area_ha.toFixed(2)} ha within 1 % (${diff >= 0 ? "+" : ""}${diff.toFixed(2)} %).`
                : `Differs from the declared ${lease.declared_area_ha.toFixed(2)} ha by ${diff >= 0 ? "+" : ""}${diff.toFixed(2)} %. Check the pillars before saving.`
              : "No lease area is declared to compare with."}
          </Alert>
          <div>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              Use this boundary
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
