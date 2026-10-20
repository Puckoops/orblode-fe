"use client";

import { Alert, Button, DateInput, Dialog, Dropzone, Field, HelperText, Input, Select, UploadItem, type IsoDate } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { createFlight, flightUploaded, generateFlight, listGnssJobs, runGnssJob, uploadGnssFiles, type GnssJob, type Mission } from "@/lib/api/mm";
import { everyTargetHasLogs, GNSS_ACCEPT, gnssTargets, isGnssLog, matchTarget } from "@/lib/mm/gnssMatch";
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

interface Log {
  file: File;
  /** "" until placed: a name that matched nothing is asked about once. */
  target: string;
  uploaded: boolean;
}

/** A vendor's processed outputs for one flight of an issued mission: a new survey of the site, uploaded and queued
 * for the same processors the upload screen uses. Photogrammetry happens before this, on the vendor's side. The
 * ground control logs go with it into the mission's DGPS job, which runs once every point has its log. */
export function FlightUpload({ mission, onClose, onDone }: { mission: Mission; onClose: () => void; onDone: () => void }) {
  const centre = mission.gcps[0]?.auto;
  const siteCrs = centre ? `EPSG:${epsgOf(zoneOf(centre.lon), centre.lat >= 0)}` : "";
  const [date, setDate] = useState<IsoDate | null>(null);
  const [label, setLabel] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ surveyId: string; queued: string[]; skipped: string[]; groundControl: string | null } | null>(null);
  const [job, setJob] = useState<GnssJob | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [refused, setRefused] = useState<string[]>([]);

  useEffect(() => {
    if (!mission.gnss_job_id) return;
    let live = true;
    listGnssJobs(mission.project_id)
      .then((jobs) => live && setJob(jobs.find((j) => j.id === mission.gnss_job_id) ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [mission.gnss_job_id, mission.project_id]);
  const surveyId = useRef("");
  const [flightStarted, setFlightStarted] = useState(false);
  const slots = useRef<Record<string, AssetSlot>>({});

  const patch = (name: string, change: Partial<Row>) => setRows((list) => list.map((r) => (r.file.name === name ? { ...r, ...change } : r)));

  const add = (dropped: File[]) => {
    const gnss = dropped.filter((f) => isGnssLog(f.name));
    if (gnss.length) {
      if (job) {
        const freshLogs = gnss.filter((f) => !logs.some((l) => l.file.name === f.name));
        setLogs((list) => [...list, ...freshLogs.map((file) => ({ file, target: matchTarget(file.name, job) ?? "", uploaded: false }))]);
        setRefused([]);
      } else setRefused(gnss.map((f) => f.name));
    }
    const files = dropped.filter((f) => !isGnssLog(f.name));
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

  // Logs go up by target; the job runs only when nothing is missing, so a partial upload can be finished later.
  const sendLogs = async (): Promise<string | null> => {
    if (!job || logs.length === 0) return null;
    let latest = job;
    for (const target of [...new Set(logs.filter((l) => !l.uploaded).map((l) => l.target))]) {
      const group = logs.filter((l) => l.target === target && !l.uploaded);
      latest = await uploadGnssFiles(job.id, target, group.map((l) => l.file));
      setLogs((list) => list.map((l) => (group.includes(l) ? { ...l, uploaded: true } : l)));
    }
    setJob(latest);
    if (!everyTargetHasLogs(latest, [])) return `Logs uploaded to ${latest.code}; some points still have none, so it hasn’t run.`;
    setJob(await runGnssJob(latest.id));
    return `Ground control: ${latest.code} is processing.`;
  };

  const start = async () => {
    if (rows.length === 0 && logs.length === 0) {
      setError("Add the processed files: DTM, DSM, orthomosaic or point cloud.");
      return;
    }
    if (rows.length > 0 && !date) {
      setError("Give the date the flight was flown.");
      return;
    }
    if (logs.some((l) => !l.target)) {
      setError("Say which point each ground control log belongs to.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (rows.length === 0) {
        setDone({ surveyId: "", queued: [], skipped: [], groundControl: await sendLogs() });
        onDone();
        return;
      }
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
      const groundControl = await sendLogs();
      setDone({ surveyId: surveyId.current, queued, skipped: plan.skips.map((s) => `${s.filename}: ${s.reason}`), groundControl });
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
      description={`Processed outputs: DTM and DSM GeoTIFFs, the orthomosaic and the point cloud, which become a new survey of the site.${
        job ? " Add the ground control logs too: they go to the mission's DGPS job." : ""
      }`}
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
          <Alert tone="success" title={done.surveyId ? "Flight uploaded" : "Logs uploaded"}>
            {done.surveyId && (done.queued.length ? `Processing: ${done.queued.join("; ")}.` : "Nothing needed processing.")}
            {done.groundControl && <span className="block">{done.groundControl}</span>}
          </Alert>
          {done.skipped.length > 0 && (
            <ul className="caption flex flex-col gap-1 text-ink-3">
              {done.skipped.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          {done.surveyId && (
            <Link href={`/viewer/${done.surveyId}`} className="small text-accent hover:underline">
              Open the survey in the viewer
            </Link>
          )}
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
          <Dropzone
            onFiles={add}
            multiple
            accept={`.tif,.tiff,.las,.laz,.dxf,.shp,.geojson,.json,.zip${job ? `,${GNSS_ACCEPT}` : ""}`}
            title={job ? "Drop the processed files and ground control logs" : "Drop the processed files"}
            hint={job ? "GeoTIFF, LAS/LAZ, DXF or GeoJSON · u-blox or RINEX logs" : "GeoTIFF, LAS/LAZ, DXF or GeoJSON"}
            disabled={busy || flightStarted}
          />
          {refused.length > 0 && (
            <HelperText tone="error">
              This mission has no DGPS job, so {refused.join(", ")} can’t go with it. Upload ground control logs from DGPS.
            </HelperText>
          )}
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
          {job && logs.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="small font-medium text-ink-1">Ground control logs for {job.code}</h3>
              {logs.map((l) => (
                <div key={l.file.name} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-hairline p-3">
                  <span className="min-w-0">
                    <span className="small block truncate text-ink-1">{l.file.name}</span>
                    <span className="caption text-ink-4">
                      {bytes(l.file.size)}
                      {l.uploaded ? " · uploaded" : !l.target ? " · which point is this?" : ""}
                    </span>
                  </span>
                  <div className="w-48">
                    <Select
                      aria-label={`Point of ${l.file.name}`}
                      value={l.target}
                      onValueChange={(target) => setLogs((list) => list.map((x) => (x === l ? { ...x, target } : x)))}
                      allLabel="Choose the point"
                      options={gnssTargets(job).map((t) => ({ value: t.target, label: t.label }))}
                      disabled={busy || l.uploaded}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
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
