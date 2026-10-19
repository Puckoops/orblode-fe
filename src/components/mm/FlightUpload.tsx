"use client";

import { Alert, Button, DateInput, Dialog, Dropzone, Field, HelperText, Input, Select, UploadItem, type IsoDate } from "@puckoops/camelot";
import Link from "next/link";
import { useRef, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { createFlight, flightUploaded, generateFlight, type Mission } from "@/lib/api/mm";
import { epsgOf, zoneOf } from "@/lib/mm/utm";
import { bytes } from "@/lib/mm/format";
import { uploadFiles, type AssetSlot, type UploadApi } from "@/lib/upload/pipeline";
import { buildProcessorPlan, guessRole, roleNeedsHeader, roleToAssetKind, ROLE_LABELS, type FileRole } from "@/lib/upload/planner";
import { putToSignedUrl } from "@/lib/upload/putToSignedUrl";
import { readRasterHeader } from "@/lib/upload/rasterRole";

const ROLES: FileRole[] = ["dtm", "dsm", "ortho", "pointcloud", "contours", "vector"];

interface Row {
  file: File;
  role: FileRole;
  crs: string;
  progress: number;
  status: "queued" | "uploading" | "done" | "failed";
}

/** A vendor's processed outputs for one flight of an issued mission: a new survey of the site, uploaded and queued
 * for the same processors the upload screen uses. Photogrammetry happens before this, on the vendor's side. */
export function FlightUpload({ mission, onClose, onDone }: { mission: Mission; onClose: () => void; onDone: () => void }) {
  const centre = mission.gcps[0]?.auto;
  const siteCrs = centre ? `EPSG:${epsgOf(zoneOf(centre.lon), centre.lat >= 0)}` : "";
  const [date, setDate] = useState<IsoDate | null>(null);
  const [label, setLabel] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ surveyId: string; queued: string[]; skipped: string[] } | null>(null);
  const surveyId = useRef("");
  const [flightStarted, setFlightStarted] = useState(false);
  const slots = useRef<Record<string, AssetSlot>>({});

  const patch = (name: string, change: Partial<Row>) => setRows((list) => list.map((r) => (r.file.name === name ? { ...r, ...change } : r)));

  const add = (files: File[]) => {
    const fresh = files.filter((f) => !rows.some((r) => r.file.name === f.name));
    setRows((list) => [...list, ...fresh.map((file) => ({ file, role: guessRole(file.name, "preprocessed"), crs: siteCrs, progress: 0, status: "queued" as const }))]);
    for (const f of fresh) {
      if (!/\.tiff?$/i.test(f.name)) continue;
      void readRasterHeader(f).then((h) => {
        if (!h) return;
        patch(f.name, { ...(h.crs ? { crs: h.crs } : {}), ...(roleNeedsHeader(f.name, "preprocessed") ? { role: h.role } : {}) });
      });
    }
  };

  const api: UploadApi = {
    initUploads: async (_survey, files) => {
      const created = await createFlight(mission.id, { survey_date: date ?? "", season_label: label, files });
      surveyId.current = created.survey_id;
      setFlightStarted(true);
      return created.uploads;
    },
    putToSignedUrl,
    markAssetUploaded: (_survey, assetId) => flightUploaded(mission.id, surveyId.current, assetId),
  };

  const start = async () => {
    if (!date) {
      setError("Give the date the flight was flown.");
      return;
    }
    if (rows.length === 0) {
      setError("Add the processed files: DTM, DSM, orthomosaic or point cloud.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadFiles(api, {
        surveyId: surveyId.current,
        files: rows.map((r) => ({ file: r.file, kind: roleToAssetKind(r.role), role: r.role, crs: r.crs || undefined })),
        slots: slots.current,
        onStatus: (name, s) => patch(name, { status: s === "uploaded" ? "done" : s === "error" ? "failed" : "uploading" }),
        onProgress: (name, f) => patch(name, { progress: Math.round(f * 100) }),
      });
      const plan = buildProcessorPlan(
        rows.map((r) => ({ name: r.file.name, role: r.role, url: slots.current[r.file.name].url, crs: r.crs || undefined })),
        { epsg: siteCrs }
      );
      const queued: string[] = [];
      for (const d of plan.dispatches) {
        await generateFlight(mission.id, surveyId.current, d.request);
        queued.push(d.label);
      }
      setDone({ surveyId: surveyId.current, queued, skipped: plan.skips.map((s) => `${s.filename}: ${s.reason}`) });
      onDone();
    } catch (err) {
      setError(refusalMessage(err, "The upload stopped. Upload again to pick up where it left off."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={`Upload a flight of ${mission.code}`}
      description="Processed outputs only: DTM and DSM GeoTIFFs, the orthomosaic and the point cloud. They become a new survey of the site."
      width={720}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="quiet" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void start()}>
              {flightStarted ? "Upload again" : "Upload and process"}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-3">
          <Alert tone="success" title="Flight uploaded">
            {done.queued.length ? `Processing: ${done.queued.join("; ")}.` : "Nothing needed processing."}
          </Alert>
          {done.skipped.length > 0 && (
            <ul className="caption flex flex-col gap-1 text-ink-3">
              {done.skipped.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          <Link href={`/viewer/${done.surveyId}`} className="small text-accent hover:underline">
            Open the survey in the viewer
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Flown on" required>
              <DateInput value={date} onChange={setDate} />
            </Field>
            <Field label="Season label" hint="Shown on the survey's tag">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="2026-27" />
            </Field>
          </div>
          <Dropzone onFiles={add} multiple accept=".tif,.tiff,.las,.laz,.dxf,.shp,.geojson,.json,.zip" title="Drop the processed files" hint="GeoTIFF, LAS/LAZ, DXF or GeoJSON" disabled={busy || flightStarted} />
          {rows.map((r) => (
            <div key={r.file.name} className="flex flex-col gap-2 rounded-md border border-hairline p-3">
              <UploadItem
                name={r.file.name}
                size={bytes(r.file.size)}
                kind={ROLE_LABELS[r.role]}
                progress={r.progress}
                status={r.status}
                onRemove={busy || r.status === "done" ? undefined : () => setRows((list) => list.filter((x) => x !== r))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select
                  aria-label={`What ${r.file.name} is`}
                  value={r.role}
                  onValueChange={(v) => patch(r.file.name, { role: v as FileRole })}
                  options={ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
                  disabled={busy || r.status === "done"}
                />
                <Input aria-label={`CRS of ${r.file.name}`} value={r.crs} onChange={(e) => patch(r.file.name, { crs: e.target.value })} placeholder="EPSG:32645" disabled={busy || r.status === "done"} />
              </div>
            </div>
          ))}
          {error && (
            <HelperText tone="error" role="alert">
              {error}
            </HelperText>
          )}
        </div>
      )}
    </Dialog>
  );
}
