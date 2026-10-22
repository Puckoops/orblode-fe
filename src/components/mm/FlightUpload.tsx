"use client";

import {
  Alert,
  Button,
  Checkbox,
  ChoiceGroup,
  DateInput,
  Dialog,
  Dropzone,
  Field,
  HelperText,
  Input,
  Progress,
  Select,
  Stepper,
  UploadItem,
  type IsoDate,
} from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CONTROL_METHOD_LABELS, ProcessingDialog } from "@/components/processing/ProcessingDialog";
import { PipelineGraph } from "@/components/upload/PipelineGraph";
import { refusalMessage } from "@/lib/api/client";
import {
  createFlight,
  flightPhotos,
  flightUploaded,
  generateFlight,
  getFlightProcessing,
  listControlPoints,
  listGnssJobs,
  marksPhotos,
  missionGeometry,
  photoUploads,
  processFlight,
  runGnssJob,
  saveMarks,
  uploadGnssFiles,
  type ControlPoint,
  type FlightProcessing,
  type FlightSource,
  type GnssJob,
  type Mission,
  type MissionGeometry,
  type PhotogrammetryPreset,
  type PhotoMark,
} from "@/lib/api/mm";
import { everyTargetHasLogs, GNSS_ACCEPT, gnssTargets, isGnssLog, matchTarget } from "@/lib/mm/gnssMatch";
import { bytes } from "@/lib/mm/format";
import { readPhotoExif } from "@/lib/mm/photoExif";
import { coverage, flightGsdCm, outerRings } from "@/lib/mm/photoGeometry";
import { isPhoto, nameAll, stillToUpload, uploadPhotos, type PhotoProgress } from "@/lib/mm/photoUpload";
import { epsgOf, zoneOf } from "@/lib/mm/utm";
import { uploadFiles, type AssetSlot, type UploadApi } from "@/lib/upload/pipeline";
import { buildProcessorPlan, guessRole, roleNeedsHeader, roleToAssetKind, ROLE_LABELS, type FileRole } from "@/lib/upload/planner";
import { putToSignedUrl } from "@/lib/upload/putToSignedUrl";
import { flightGraph, NOT_UPLOADED, type FlightGraphInput, type Upload } from "@/lib/upload/pipelineGraph";
import { readRasterHeader } from "@/lib/upload/rasterRole";
import { GcpMarking, markCounts, MARKS_PER_GCP, type MarkablePhoto, type MarkablePoint } from "./GcpMarking";

const ROLES: FileRole[] = ["dtm", "dsm", "ortho", "pointcloud", "contours", "vector"];
const STEPS = [{ label: "Flight" }, { label: "Your data" }, { label: "Ground control" }, { label: "Check" }, { label: "Process" }];
const MIN_GCPS = 3;
/** Photos that see a typical point of the site; fewer and photogrammetry leaves holes. */
const MIN_OVERLAP = 9;
const EXIF_READERS = 6;

/** The same photo dropped again is the same path, size and time. */
const fileKey = (f: File) => `${f.webkitRelativePath || f.name}:${f.size}:${f.lastModified}`;

const PRESETS: { value: PhotogrammetryPreset; label: string }[] = [
  { value: "fast", label: "Fast · 10 cm" },
  { value: "standard", label: "Standard · 5 cm" },
  { value: "high", label: "High · 2 cm" },
];

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

/**
 * One flight of an issued mission, as a stepper: the flight, its data, its ground control, a check and processing. The
 * data is either the drone's raw photos, which Orblode makes into the survey's layers, or files the vendor processed,
 * which go to the same processors the upload screen uses. The ground control logs go with either into the mission's
 * DGPS job. A flight of photos not yet processed is picked up again when the dialog reopens.
 */
export function FlightUpload({ mission, onClose, onDone }: { mission: Mission; onClose: () => void; onDone: () => void }) {
  const centre = mission.gcps[0]?.auto;
  const siteCrs = centre ? `EPSG:${epsgOf(zoneOf(centre.lon), centre.lat >= 0)}` : "";
  const method = mission.settings.control_method;
  const [step, setStep] = useState(0);
  const [source, setSource] = useState<FlightSource>("photos");
  const [date, setDate] = useState<IsoDate | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [job, setJob] = useState<GnssJob | null>(null);
  const [points, setPoints] = useState<ControlPoint[]>([]);
  const [geometry, setGeometry] = useState<MissionGeometry | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [refused, setRefused] = useState<string[]>([]);

  const [rows, setRows] = useState<Row[]>([]);
  const slots = useRef<Record<string, AssetSlot>>({});
  const [done, setDone] = useState<{ queued: string[]; skipped: string[]; groundControl: string | null } | null>(null);

  const surveyId = useRef("");
  const [started, setStarted] = useState("");
  const [flight, setFlight] = useState<FlightProcessing | null>(null);
  const [resumable, setResumable] = useState<FlightProcessing | null>(null);
  const [photos, setPhotos] = useState<MarkablePhoto[]>([]);
  const [reading, setReading] = useState(0);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [progress, setProgress] = useState<PhotoProgress | null>(null);
  const [uploading, setUploading] = useState(false);
  const [marks, setMarks] = useState<PhotoMark[]>([]);
  const [preset, setPreset] = useState<PhotogrammetryPreset>("standard");
  const [layers, setLayers] = useState({ dsm: true, orthophoto: true, pointcloud: false });
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    let live = true;
    if (mission.gnss_job_id)
      listGnssJobs(mission.project_id)
        .then((jobs) => live && setJob(jobs.find((j) => j.id === mission.gnss_job_id) ?? null))
        .catch(() => undefined);
    listControlPoints({ missionId: mission.id })
      .then((p) => live && setPoints(p))
      .catch(() => undefined);
    missionGeometry(mission.id)
      .then((g) => live && setGeometry(g))
      .catch(() => undefined);
    // The newest flight still taking photos, or whose processing failed, is offered to carry on with.
    Promise.all(mission.survey_ids.slice(-3).map((sid) => getFlightProcessing(mission.id, sid).catch(() => null))).then((flights) => {
      const open = flights.filter((f): f is FlightProcessing => !!f && (f.status === "uploading" || f.status === "failed")).pop();
      if (live && open) setResumable(open);
    });
    return () => {
      live = false;
    };
  }, [mission.id, mission.gnss_job_id, mission.project_id, mission.survey_ids]);

  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const resume = async (f: FlightProcessing) => {
    surveyId.current = f.survey_id;
    setStarted(f.survey_id);
    setFlight(f);
    setSource("photos");
    setMarks(f.marks ?? []);
    setResumable(null);
    try {
      setUploaded((await flightPhotos(mission.id, f.survey_id)).uploaded ?? []);
    } catch {
      setUploaded([]);
    }
    setStep(1);
  };

  const addLogs = (dropped: File[]) => {
    const gnss = dropped.filter((f) => isGnssLog(f.name));
    if (!gnss.length) return;
    if (!job) {
      setRefused(gnss.map((f) => f.name));
      return;
    }
    const fresh = gnss.filter((f) => !logs.some((l) => l.file.name === f.name));
    setLogs((list) => [...list, ...fresh.map((file) => ({ file, target: matchTarget(file.name, job) ?? "", uploaded: false }))]);
    setRefused([]);
  };

  const patch = (name: string, change: Partial<Row>) => setRows((list) => list.map((r) => (r.file.name === name ? { ...r, ...change } : r)));

  const addFiles = (dropped: File[]) => {
    addLogs(dropped);
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

  const addPhotos = async (dropped: File[]) => {
    addLogs(dropped);
    const have = new Set(photos.map((p) => fileKey(p.file)));
    const named = nameAll(
      dropped.filter((f) => isPhoto(f.name) && !have.has(fileKey(f))),
      photos.map((p) => p.name)
    );
    if (!named.length) return;
    setReading((r) => r + named.length);
    let next = 0;
    const read: MarkablePhoto[] = [];
    const flush = () => {
      const chunk = read.splice(0);
      if (chunk.length) setPhotos((list) => [...list, ...chunk]);
      setReading((r) => r - chunk.length);
    };
    await Promise.all(
      Array.from({ length: EXIF_READERS }, async () => {
        while (next < named.length) {
          const { file, name } = named[next++];
          read.push({ name, file, exif: await readPhotoExif(file) });
          if (read.length >= 25) flush();
        }
      })
    );
    flush();
  };

  const startFlight = async (input: { source: FlightSource; files?: Parameters<typeof createFlight>[1]["files"] }) => {
    const created = await createFlight(mission.id, { survey_date: date ?? "", season_label: label, ...input });
    surveyId.current = created.survey_id;
    setStarted(created.survey_id);
    if (created.processing) setFlight(created.processing);
    return created;
  };

  const sendPhotos = async () => {
    if (!date && !flight) {
      setError("Give the date the flight was flown.");
      setStep(0);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      if (!flight) await startFlight({ source: "photos" });
      const have = (await flightPhotos(mission.id, surveyId.current)).uploaded ?? [];
      setUploaded(have);
      const todo = stillToUpload(photos, have);
      await uploadPhotos(
        {
          sign: async (batch) => (await photoUploads(mission.id, surveyId.current, batch)).urls,
          put: putToSignedUrl,
        },
        todo,
        { onProgress: setProgress }
      );
      setUploaded([...have, ...todo.map((p) => p.name)]);
      setFlight(await getFlightProcessing(mission.id, surveyId.current));
    } catch (err) {
      setError(refusalMessage(err, "The upload stopped. Upload again to send the photos still missing."));
    } finally {
      setUploading(false);
    }
  };

  // Logs go up by target; the job runs only when nothing is missing, so a partial upload can be finished later.
  const sendLogs = async (): Promise<string | null> => {
    if (!job || !logs.some((l) => !l.uploaded)) return null;
    let latest = job;
    for (const target of [...new Set(logs.filter((l) => !l.uploaded).map((l) => l.target))]) {
      const group = logs.filter((l) => l.target === target && !l.uploaded);
      latest = await uploadGnssFiles(job.id, target, group.map((l) => l.file));
      setLogs((list) => list.map((l) => (group.includes(l) ? { ...l, uploaded: true } : l)));
    }
    setJob(latest);
    if (!everyTargetHasLogs(latest, [])) return `Logs uploaded to ${latest.code}; some points still have none, so it hasn’t run.`;
    const ran = await runGnssJob(latest.id);
    setJob(ran);
    return `Ground control: ${ran.code} is processing.`;
  };

  const sendFiles = async () => {
    if (rows.length === 0 && logs.length === 0) {
      setError("Add the processed files: DTM, DSM, orthomosaic or point cloud.");
      return;
    }
    if (rows.length > 0 && !date) {
      setError("Give the date the flight was flown.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (rows.length === 0) {
        setDone({ queued: [], skipped: [], groundControl: await sendLogs() });
        onDone();
        return;
      }
      const api: UploadApi = {
        initUploads: async (_survey, files) => {
          const created = await startFlight({ source: "processed", files });
          return created.uploads ?? { uploads: [] };
        },
        putToSignedUrl,
        markAssetUploaded: (_survey, assetId) => flightUploaded(mission.id, surveyId.current, assetId),
      };
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
      setDone({ queued, skipped: plan.skips.map((s) => `${s.filename}: ${s.reason}`), groundControl });
      onDone();
    } catch (err) {
      setError(refusalMessage(err, "The upload stopped. Upload again to pick up where it left off."));
    } finally {
      setBusy(false);
    }
  };

  const process = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendLogs();
      if (marksPhotos(method)) await saveMarks(mission.id, surveyId.current, marks);
      setFlight(await processFlight(mission.id, surveyId.current, { preset, layers }));
      setWatching(true);
      onDone();
    } catch (err) {
      setError(refusalMessage(err, "Processing couldn't start."));
    } finally {
      setBusy(false);
    }
  };

  const leaveGroundControl = async () => {
    if (source === "photos" && marksPhotos(method) && surveyId.current && flight?.status !== "queued") {
      try {
        setFlight(await saveMarks(mission.id, surveyId.current, marks));
      } catch (err) {
        setError(refusalMessage(err, "The marks couldn't be saved."));
        return;
      }
    }
    setStep(3);
  };

  const next = () => {
    setError(null);
    if (step === 0) {
      if (!date && !flight) return setError("Give the date the flight was flown.");
      return setStep(1);
    }
    if (step === 1 && source === "photos" && !surveyId.current) return setError("Upload the photos first; the rest of the steps work while they go up.");
    if (step === 2) return void leaveGroundControl();
    setStep(step + 1);
  };

  const gcpPoints: MarkablePoint[] = mission.gcps
    .filter((g) => g.role === "gcp")
    .map((g) => {
      const solved = points.find((p) => p.point_id === g.id);
      return { id: g.id, at: solved ? { lon: solved.lon, lat: solved.lat } : g.final };
    });
  const counts = markCounts(marks);
  const markedGcps = gcpPoints.filter((p) => (counts.get(p.id) ?? 0) >= MARKS_PER_GCP).length;
  const allUploaded = photos.length > 0 ? stillToUpload(photos, uploaded).length === 0 : (flight?.photos.count ?? 0) > 0;
  const dataUpload: Upload =
    source === "photos"
      ? uploading && progress
        ? { state: "uploading", percent: progress.fraction * 100 }
        : allUploaded
          ? { state: "done", label: `${photos.length || flight?.photos.count} photos` }
          : NOT_UPLOADED
      : rows.some((r) => r.status === "uploading")
        ? { state: "uploading", percent: rows.reduce((sum, r) => sum + r.progress, 0) / rows.length }
        : rows.length > 0 && rows.every((r) => r.status === "done")
          ? { state: "done", label: `${rows.length} file${rows.length === 1 ? "" : "s"}` }
          : NOT_UPLOADED;
  const graphInput: FlightGraphInput = {
    source: source === "photos" ? "photos" : "processed",
    data: dataUpload,
    logs: logs.length > 0 && logs.every((l) => l.uploaded) ? { state: "done", label: `${logs.length} log${logs.length === 1 ? "" : "s"}` } : NOT_UPLOADED,
    layers:
      source === "photos"
        ? layers
        : { dsm: rows.some((r) => r.role === "dsm"), orthophoto: rows.some((r) => r.role === "ortho"), pointcloud: rows.some((r) => r.role === "pointcloud") },
    season: mission.season,
  };
  const locked = !!flight && flight.status !== "uploading" && flight.status !== "failed";

  return (
    <>
      <Dialog
        open={!watching}
        onOpenChange={(o) => !o && !busy && !uploading && onClose()}
        title={`Upload a flight of ${mission.code}`}
        description="The drone's photos for Orblode to process, or files you processed yourself. Each flight becomes a new survey of the site."
        width={1040}
        footer={
          done ? (
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="quiet" disabled={busy || uploading} onClick={onClose}>
                Cancel
              </Button>
              {step > 0 && (
                <Button variant="ghost" disabled={busy} onClick={() => setStep(step - 1)}>
                  Back
                </Button>
              )}
              {step < 4 ? (
                <Button variant="primary" disabled={busy} onClick={next}>
                  Next
                </Button>
              ) : source === "photos" ? (
                <Button variant="primary" loading={busy} disabled={uploading || !allUploaded || locked} onClick={() => void process()}>
                  Process the flight
                </Button>
              ) : (
                <Button variant="primary" loading={busy} onClick={() => void sendFiles()}>
                  {started ? "Upload again" : "Upload and process"}
                </Button>
              )}
            </>
          )
        }
      >
        <div className="flex flex-col gap-5">
          <Stepper steps={STEPS} current={done ? STEPS.length : step} onStepClick={busy ? undefined : setStep} aria-label="Flight upload" />
          {done ? (
            <FilesDone done={done} surveyId={started} />
          ) : (
            <>
              {step === 0 && (
                <div className="flex flex-col gap-4">
                  {resumable && !flight && (
                    <Alert
                      tone="info"
                      title={resumable.status === "failed" ? "A flight of photos failed to process" : "A flight of photos is still uploading"}
                      action={
                        <Button variant="ghost" size="sm" onClick={() => void resume(resumable)}>
                          Continue it
                        </Button>
                      }
                    >
                      {resumable.photos.count} photos are in storage. Continue it, or start a new flight below.
                    </Alert>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Flown on" required={!flight}>
                      <DateInput value={date} onChange={setDate} disabled={!!flight} />
                    </Field>
                    <Field label="Season label" hint="Shown on the survey's tag">
                      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="2026-27" disabled={!!flight} />
                    </Field>
                  </div>
                  <Field label="What you have">
                    <ChoiceGroup
                      look="outline"
                      value={source}
                      onValueChange={setSource}
                      options={[
                        { value: "photos", label: "Drone photos · Orblode makes the layers" },
                        { value: "processed", label: "Files you processed · DTM, DSM, orthomosaic" },
                      ]}
                    />
                  </Field>
                  <p className="caption text-ink-3">
                    {source === "photos"
                      ? "Orblode runs photogrammetry on the photos, tied to the DGPS-solved ground control, and checks the DTM against the check points."
                      : "The survey is labelled as processed by the vendor. Its accuracy is still checked against the check points."}
                  </p>
                </div>
              )}

              {step === 1 && (
                <div className="flex flex-wrap gap-5">
                  <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
                    {source === "photos" ? (
                      <PhotosStep
                        photos={photos}
                        reading={reading}
                        uploaded={uploaded}
                        expected={flight?.photos.count ?? 0}
                        progress={progress}
                        uploading={uploading}
                        locked={locked}
                        onDrop={(files) => void addPhotos(files)}
                        onRemove={(name) => setPhotos((list) => list.filter((p) => p.name !== name))}
                        onUpload={() => void sendPhotos()}
                        acceptLogs={!!job}
                      />
                    ) : (
                      <FilesStep rows={rows} busy={busy} acceptLogs={!!job} onDrop={addFiles} onPatch={patch} onRemove={(r) => setRows((list) => list.filter((x) => x !== r))} />
                    )}
                    {source === "photos" && (
                      <div className="flex flex-col gap-2">
                        <span className="caption font-mono font-medium tracking-wider text-ink-3">LAYERS TO BUILD</span>
                        <Checkbox checked disabled label="DTM · always made, for the study" />
                        <Checkbox checked={layers.dsm} onCheckedChange={(v) => setLayers((l) => ({ ...l, dsm: v }))} label="DSM · surface heights, for 3D and cross-sections" disabled={locked} />
                        <Checkbox checked={layers.orthophoto} onCheckedChange={(v) => setLayers((l) => ({ ...l, orthophoto: v }))} label="Orthomosaic · the map image" disabled={locked} />
                        <Checkbox checked={layers.pointcloud} onCheckedChange={(v) => setLayers((l) => ({ ...l, pointcloud: v }))} label="Point cloud · 3D tiles in the viewer" disabled={locked} />
                      </div>
                    )}
                    <LogsList job={job} logs={logs} refused={refused} busy={busy} onTarget={(l, target) => setLogs((list) => list.map((x) => (x === l ? { ...x, target } : x)))} />
                  </div>
                  <div className="min-w-0 flex-[0_1_522px]">
                    <PipelineGraph graph={flightGraph(graphInput)} label="Pipeline for this flight" siteLabel="From the lease">
                      {source === "photos"
                        ? "Orblode solves the GNSS logs first, then processes the photos with those GCPs, so the DTM is tied to surveyed ground and every season shares one datum."
                        : "Your DTM is taken as it is. Orblode only checks it against the DGPS check points, and the report says it was processed by the vendor."}
                    </PipelineGraph>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="flex flex-col gap-4">
                  <DgpsStatus job={job} points={points} logs={logs} />
                  {source === "photos" &&
                    (marksPhotos(method) ? (
                      photos.length > 0 ? (
                        <GcpMarking points={gcpPoints} photos={photos} marks={marks} onChange={setMarks} disabled={locked} />
                      ) : (
                        <HelperText>
                          Add the flight&apos;s photos again in Your data to mark the targets: {flight?.marks?.length ?? 0} marks are saved.
                        </HelperText>
                      )
                    ) : method === "coded" ? (
                      <Alert tone="info" title="Coded targets are found automatically">
                        Each GCP&apos;s target is found in the photos near it:{" "}
                        {mission.gcps
                          .filter((g) => g.role === "gcp")
                          .map((g) => `${g.id} → marker ${g.marker_id ?? "?"}`)
                          .join(", ")}
                        .
                      </Alert>
                    ) : (
                      <Alert tone="info" title="The drone's RTK positions place the photos">
                        No marking is needed. Every surveyed point is kept as a check point, to measure the DTM&apos;s accuracy.{" "}
                        {photos.length > 0 && `${photos.filter((p) => p.exif.rtk).length} of ${photos.length} photos have a fixed RTK position.`}
                      </Alert>
                    ))}
                </div>
              )}

              {step === 3 &&
                (source === "photos" ? (
                  <PhotosCheck
                    photos={photos}
                    uploaded={uploaded}
                    allUploaded={allUploaded}
                    geometry={geometry}
                    method={method}
                    markedGcps={markedGcps}
                    gcpCount={gcpPoints.length}
                    job={job}
                  />
                ) : (
                  <FilesCheck rows={rows} job={job} logs={logs} />
                ))}

              {step === 4 &&
                (source === "photos" ? (
                  <div className="flex flex-col gap-4">
                    <Field label="Quality" hint="The DEM and orthomosaic resolution; higher takes longer">
                      <ChoiceGroup look="outline" value={preset} onValueChange={setPreset} options={PRESETS} />
                    </Field>
                    <p className="small text-ink-2">
                      Builds the DTM{layers.dsm ? ", DSM" : ""}
                      {layers.orthophoto ? ", orthomosaic" : ""}
                      {layers.pointcloud ? " and point cloud" : ""}. Change the layers in Your data.
                    </p>
                    <p className="caption text-ink-3">
                      {CONTROL_METHOD_LABELS[method] ?? method}. The survey stays closed in the viewer until every layer is ready; the progress shows here and on
                      the mission.
                    </p>
                    {!allUploaded && <HelperText tone="error">Some photos haven&apos;t finished uploading.</HelperText>}
                  </div>
                ) : (
                  <p className="small text-ink-2">
                    {rows.length} file{rows.length === 1 ? "" : "s"} go to processing{logs.length ? `, and ${logs.length} ground control log${logs.length === 1 ? "" : "s"} to the DGPS job` : ""}.
                  </p>
                ))}

              {error && (
                <HelperText tone="error" role="alert">
                  {error}
                </HelperText>
              )}
            </>
          )}
        </div>
      </Dialog>
      {watching && started && <ProcessingDialog surveyId={started} open onClose={onClose} />}
    </>
  );
}

function PhotosStep({
  photos,
  reading,
  uploaded,
  expected,
  progress,
  uploading,
  locked,
  onDrop,
  onRemove,
  onUpload,
  acceptLogs,
}: {
  photos: MarkablePhoto[];
  reading: number;
  uploaded: string[];
  expected: number;
  progress: PhotoProgress | null;
  uploading: boolean;
  locked: boolean;
  onDrop: (files: File[]) => void;
  onRemove: (name: string) => void;
  onUpload: () => void;
  acceptLogs: boolean;
}) {
  const folder = useRef<HTMLInputElement>(null);
  const size = photos.reduce((sum, p) => sum + p.file.size, 0);
  const located = photos.filter((p) => p.exif.lat !== undefined).length;
  const missing = stillToUpload(photos, uploaded);
  return (
    <div className="flex flex-col gap-3">
      <Dropzone
        onFiles={onDrop}
        multiple
        accept={`.jpg,.jpeg,.tif,.tiff${acceptLogs ? `,${GNSS_ACCEPT}` : ""}`}
        title={acceptLogs ? "Drop the drone's photos and the ground control logs" : "Drop the drone's photos"}
        hint="JPEG or TIFF straight from the drone, EXIF intact"
        disabled={uploading || locked}
      />
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" disabled={uploading || locked} onClick={() => folder.current?.click()}>
          Choose a folder
        </Button>
        <input
          ref={folder}
          type="file"
          multiple
          hidden
          {...{ webkitdirectory: "" }}
          onChange={(e) => {
            onDrop(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <span className="caption text-ink-3">DJI folders such as 100MEDIA keep their name, so repeated file names stay apart.</span>
      </div>
      {(photos.length > 0 || expected > 0) && (
        <div className="flex flex-col gap-2 rounded-md border border-hairline p-3">
          <span className="small text-ink-1">
            {photos.length > 0
              ? `${photos.length} photos · ${bytes(size)} · ${located} with a position${reading ? ` · reading ${reading}` : ""}`
              : `${expected} photos in storage. Add them again here to mark targets or send the rest.`}
          </span>
          {photos.length > 0 && (
            <Progress
              value={uploading && progress ? Math.round(progress.fraction * 100) : Math.round((100 * (photos.length - missing.length)) / photos.length)}
              label={uploading && progress ? `Uploading ${progress.done} of ${progress.total}` : `${photos.length - missing.length} of ${photos.length} uploaded`}
              size="thin"
            />
          )}
          {photos.length > 0 && missing.length > 0 && !locked && (
            <div>
              <Button variant="primary" size="sm" loading={uploading} disabled={reading > 0} onClick={onUpload}>
                {missing.length === photos.length ? "Upload photos" : `Upload the ${missing.length} still missing`}
              </Button>
            </div>
          )}
          {photos.length > 0 && photos.length <= 12 && (
            <ul className="flex flex-col gap-1">
              {photos.map((p) => (
                <li key={p.name}>
                  <UploadItem
                    name={p.name}
                    size={bytes(p.file.size)}
                    progress={uploaded.includes(p.name) ? 100 : 0}
                    status={uploaded.includes(p.name) ? "done" : "queued"}
                    onRemove={uploading || uploaded.includes(p.name) ? undefined : () => onRemove(p.name)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function FilesStep({
  rows,
  busy,
  acceptLogs,
  onDrop,
  onPatch,
  onRemove,
}: {
  rows: Row[];
  busy: boolean;
  acceptLogs: boolean;
  onDrop: (files: File[]) => void;
  onPatch: (name: string, change: Partial<Row>) => void;
  onRemove: (r: Row) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Dropzone
        onFiles={onDrop}
        multiple
        accept={`.tif,.tiff,.las,.laz,.dxf,.shp,.geojson,.json,.zip${acceptLogs ? `,${GNSS_ACCEPT}` : ""}`}
        title={acceptLogs ? "Drop the processed files and ground control logs" : "Drop the processed files"}
        hint={acceptLogs ? "GeoTIFF, LAS/LAZ, DXF or GeoJSON · u-blox or RINEX logs" : "GeoTIFF, LAS/LAZ, DXF or GeoJSON"}
        disabled={busy}
      />
      {rows.map((r) => (
        <div key={r.file.name} className="flex flex-col gap-2 rounded-md border border-hairline p-3">
          <UploadItem
            name={r.file.name}
            size={bytes(r.file.size)}
            kind={ROLE_LABELS[r.role]}
            progress={r.progress}
            status={r.status}
            onRemove={busy || r.status === "done" ? undefined : () => onRemove(r)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              aria-label={`What ${r.file.name} is`}
              value={r.role}
              onValueChange={(v) => onPatch(r.file.name, { role: v as FileRole })}
              options={ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
              disabled={busy || r.status === "done"}
            />
            <Input aria-label={`CRS of ${r.file.name}`} value={r.crs} onChange={(e) => onPatch(r.file.name, { crs: e.target.value })} placeholder="EPSG:32645" disabled={busy || r.status === "done"} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LogsList({ job, logs, refused, busy, onTarget }: { job: GnssJob | null; logs: Log[]; refused: string[]; busy: boolean; onTarget: (l: Log, target: string) => void }) {
  return (
    <>
      {refused.length > 0 && (
        <HelperText tone="error">
          This mission has no DGPS job, so {refused.join(", ")} can’t go with it. Upload ground control logs from DGPS.
        </HelperText>
      )}
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
                  onValueChange={(target) => onTarget(l, target)}
                  allLabel="Choose the point"
                  options={gnssTargets(job).map((t) => ({ value: t.target, label: t.label }))}
                  disabled={busy || l.uploaded}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function DgpsStatus({ job, points, logs }: { job: GnssJob | null; points: ControlPoint[]; logs: Log[] }) {
  if (!job) return <HelperText>This mission has no DGPS job. Ground control is tied in only through a DGPS solve, so ask the planner to make one.</HelperText>;
  const fixed = points.filter((p) => p.solution === "fixed").length;
  const waiting = logs.some((l) => !l.uploaded);
  const text =
    job.status === "completed"
      ? `${job.code} is solved: ${fixed} of ${points.length} points have a fixed solution.`
      : job.status === "failed"
        ? `${job.code} failed${job.error ? `: ${job.error}` : ""}. Fix its logs on the DGPS page.`
        : waiting
          ? `${job.code}: the logs added in Your data go up when the flight is processed.`
          : `${job.code} is ${job.status === "queued" ? "solving" : "waiting for logs"}. Processing waits until it is solved.`;
  return (
    <Alert tone={job.status === "completed" ? "success" : job.status === "failed" ? "critical" : "info"} title="DGPS">
      {text}
    </Alert>
  );
}

function PhotosCheck({
  photos,
  uploaded,
  allUploaded,
  geometry,
  method,
  markedGcps,
  gcpCount,
  job,
}: {
  photos: MarkablePhoto[];
  uploaded: string[];
  allUploaded: boolean;
  geometry: MissionGeometry | null;
  method: Mission["settings"]["control_method"];
  markedGcps: number;
  gcpCount: number;
  job: GnssJob | null;
}) {
  const cover = useMemo(() => {
    if (!geometry || photos.length === 0) return null;
    const rings = outerRings(geometry.buffer).length ? outerRings(geometry.buffer) : outerRings(geometry.lease);
    return coverage(photos, rings);
  }, [geometry, photos]);
  const gsd = flightGsdCm(photos);
  const unplaced = photos.filter((p) => p.exif.lat === undefined).length;
  const checks: { ok: boolean; text: string }[] = [
    { ok: allUploaded, text: allUploaded ? `${uploaded.length || photos.length} photos uploaded` : "Some photos are still uploading" },
    { ok: job?.status === "completed", text: job?.status === "completed" ? "DGPS is solved" : "DGPS isn't solved yet; processing waits for it" },
  ];
  if (marksPhotos(method)) checks.push({ ok: markedGcps >= MIN_GCPS, text: `${markedGcps} of ${gcpCount} GCPs marked in ${MARKS_PER_GCP} or more photos; ${MIN_GCPS} are needed` });
  if (cover)
    checks.push(
      { ok: cover.coveredPct >= 95, text: `The photos cover ${cover.coveredPct.toFixed(0)}% of the lease and its buffer` },
      { ok: cover.medianPhotos >= MIN_OVERLAP, text: `A typical point is seen by ${cover.medianPhotos} photos; ${MIN_OVERLAP} or more keep the DTM whole` }
    );
  if (unplaced) checks.push({ ok: false, text: `${unplaced} photos have no position; photogrammetry may leave them out` });
  return (
    <div className="flex flex-col gap-3">
      {photos.length === 0 && <HelperText>Add the photos again in Your data to check their coverage.</HelperText>}
      {gsd !== undefined && <p className="small text-ink-2">Ground sample distance about {gsd.toFixed(1)} cm.</p>}
      <div className="flex flex-col gap-1">
        {checks.map((c) => (
          <HelperText key={c.text} tone={c.ok ? "success" : "error"}>
            {c.text}
          </HelperText>
        ))}
      </div>
    </div>
  );
}

function FilesCheck({ rows, job, logs }: { rows: Row[]; job: GnssJob | null; logs: Log[] }) {
  const roles = new Set(rows.map((r) => r.role));
  return (
    <div className="flex flex-col gap-1">
      <HelperText tone={roles.has("dtm") ? "success" : "error"}>{roles.has("dtm") ? "A DTM, which the replenishment study measures" : "No DTM: the study needs one"}</HelperText>
      <HelperText>
        {rows.length} file{rows.length === 1 ? "" : "s"}: {[...roles].map((r) => ROLE_LABELS[r]).join(", ") || "none"}
      </HelperText>
      {job && <HelperText>{logs.length ? `${logs.length} ground control logs for ${job.code}` : `No ground control logs for ${job.code}`}</HelperText>}
    </div>
  );
}

function FilesDone({ done, surveyId }: { done: { queued: string[]; skipped: string[]; groundControl: string | null }; surveyId: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="success" title={surveyId ? "Flight uploaded" : "Logs uploaded"}>
        {surveyId && (done.queued.length ? `Processing: ${done.queued.join("; ")}.` : "Nothing needed processing.")}
        {done.groundControl && <span className="block">{done.groundControl}</span>}
      </Alert>
      {done.skipped.length > 0 && (
        <ul className="caption flex flex-col gap-1 text-ink-3">
          {done.skipped.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {surveyId && (
        <Link href={`/viewer/${surveyId}`} className="small text-accent hover:underline">
          Open the survey in the viewer
        </Link>
      )}
    </div>
  );
}
