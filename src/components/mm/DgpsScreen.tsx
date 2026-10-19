"use client";

import { Add01Icon, Delete02Icon, Download01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import {
  Alert,
  Band,
  Button,
  Dialog,
  Field,
  HelperText,
  IconButton,
  Input,
  Page,
  PageHeader,
  SearchSelect,
  Select,
  Skeleton,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@puckoops/camelot";
import { useCallback, useEffect, useRef, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import {
  CONTROL_POINTS_CSV_URL,
  createGnssJob,
  listControlPoints,
  listGnssJobs,
  listLeases,
  listMissions,
  runGnssJob,
  uploadGnssFiles,
  type ControlPoint,
  type GnssFile,
  type GnssJob,
  type GnssJobInput,
  type Lease,
  type Mission,
} from "@/lib/api/mm";
import { bytes, dateOf } from "@/lib/mm/format";
import { toast } from "@/lib/toast";
import { useWorkspaceSites } from "@/lib/workspaces/store";
import { GNSS_STATUS, MMGate, SOLUTION, StatusChip } from "./common";

type RoverRow = GnssJobInput["rovers"][number];

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

function NewJob({ leases, onClose, onCreated }: { leases: Lease[]; onClose: () => void; onCreated: (j: GnssJob) => void }) {
  const sites = useWorkspaceSites();
  const leaseSites = sites.filter((s) => leases.some((l) => l.project_id === s.id));
  const [projectId, setProjectId] = useState<string | null>(leaseSites[0]?.id ?? null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionId, setMissionId] = useState("");
  const [ref, setRef] = useState({ name: "", lat: "", lon: "", h: "", antenna: "0" });
  const [base, setBase] = useState({ point: "BASE", antenna: "1.5", on: true });
  const [rovers, setRovers] = useState<RoverRow[]>([]);
  const [mask, setMask] = useState("15");
  const [geoid, setGeoid] = useState<"egm2008" | "none">("egm2008");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    listMissions({ projectId })
      .then((ms) => setMissions(ms.filter((m) => m.status !== "draft")))
      .catch(() => setMissions([]));
  }, [projectId]);

  const fromMission = (id: string) => {
    setMissionId(id);
    const m = missions.find((x) => x.id === id);
    if (m) setRovers(m.gcps.map((g) => ({ point_id: g.id, role: g.role, antenna_height_m: 1.8, gcp_id: g.id })));
  };

  const create = async () => {
    const lat = num(ref.lat);
    const lon = num(ref.lon);
    const h = num(ref.h);
    if (!projectId || !ref.name.trim() || [lat, lon, h].some(Number.isNaN)) {
      setError("Choose the site and give the reference station's name and known coordinates.");
      return;
    }
    if (!base.on && rovers.length === 0) {
      setError("Add the base or at least one rover.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const j = await createGnssJob({
        project_id: projectId,
        mission_id: missionId || undefined,
        reference: { kind: "cors", name: ref.name.trim(), lat, lon, h_ellipsoid: h, antenna_height_m: Number(ref.antenna) || 0 },
        base: base.on ? { point_id: base.point.trim() || "BASE", antenna_height_m: Number(base.antenna) || 0 } : undefined,
        rovers,
        elevation_mask_deg: Number(mask) || 15,
        geoid,
      });
      toast.success(`${j.code} created: upload the observation files next.`);
      onCreated(j);
      onClose();
    } catch (err) {
      setError(refusalMessage(err, "Couldn't create the job. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="New DGPS job"
      description="The base is solved static against the reference station, then each rover against the fixed base."
      width={760}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void create()}>
            Create job
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Site">
            <SearchSelect
              value={projectId}
              onValueChange={(v) => {
                setMissionId("");
                setProjectId(v);
              }}
              placeholder="Choose a site"
              searchPlaceholder="Find a site"
              options={leaseSites.map((s) => ({ value: s.id, label: s.name }))}
              empty={() => "No site has a lease yet."}
            />
          </Field>
          <Field label="Mission" hint="Fills the rovers with its ground control">
            <Select value={missionId} onValueChange={fromMission} allLabel="None" options={missions.map((m) => ({ value: m.id, label: m.code }))} />
          </Field>
        </div>
        <fieldset className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3">
          <legend className="small mb-2 font-medium text-ink-1">Reference station (CORS)</legend>
          <Input aria-label="Reference name" placeholder="CORS station name" value={ref.name} onChange={(e) => setRef({ ...ref, name: e.target.value })} />
          <Input aria-label="Latitude" placeholder="Latitude" value={ref.lat} onChange={(e) => setRef({ ...ref, lat: e.target.value })} />
          <Input aria-label="Longitude" placeholder="Longitude" value={ref.lon} onChange={(e) => setRef({ ...ref, lon: e.target.value })} />
          <Input aria-label="Ellipsoidal height" placeholder="h (m)" value={ref.h} onChange={(e) => setRef({ ...ref, h: e.target.value })} />
          <Input aria-label="Antenna height" placeholder="Antenna (m)" value={ref.antenna} onChange={(e) => setRef({ ...ref, antenna: e.target.value })} />
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="small mb-2 font-medium text-ink-1">Base</legend>
          <label className="small flex items-center gap-2">
            <input type="checkbox" checked={base.on} onChange={(e) => setBase({ ...base, on: e.target.checked })} />
            A base occupied for the session
          </label>
          {base.on && (
            <div className="grid grid-cols-2 gap-3">
              <Input aria-label="Base point id" value={base.point} onChange={(e) => setBase({ ...base, point: e.target.value })} />
              <Input aria-label="Base antenna height" value={base.antenna} onChange={(e) => setBase({ ...base, antenna: e.target.value })} placeholder="Antenna (m)" />
            </div>
          )}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="small mb-2 font-medium text-ink-1">Rovers</legend>
          {rovers.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-3">
              <Input aria-label="Point id" value={r.point_id} onChange={(e) => setRovers(rovers.map((x, k) => (k === i ? { ...x, point_id: e.target.value } : x)))} />
              <Select
                aria-label="Role"
                value={r.role}
                onValueChange={(v) => setRovers(rovers.map((x, k) => (k === i ? { ...x, role: v as RoverRow["role"] } : x)))}
                options={[
                  { value: "gcp", label: "GCP" },
                  { value: "check", label: "Check point" },
                ]}
              />
              <Input
                aria-label="Antenna height"
                value={String(r.antenna_height_m)}
                onChange={(e) => setRovers(rovers.map((x, k) => (k === i ? { ...x, antenna_height_m: Number(e.target.value) || 0 } : x)))}
              />
              <IconButton icon={Delete02Icon} aria-label={`Remove ${r.point_id}`} variant="bare" size="sm" onClick={() => setRovers(rovers.filter((_, k) => k !== i))} />
            </div>
          ))}
          <div>
            <Button size="sm" variant="quiet" iconStart={Add01Icon} onClick={() => setRovers([...rovers, { point_id: `P${rovers.length + 1}`, role: "gcp", antenna_height_m: 1.8 }])}>
              Add a rover
            </Button>
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Elevation mask (°)">
            <Input type="number" min="0" max="30" value={mask} onChange={(e) => setMask(e.target.value)} />
          </Field>
          <Field label="Heights">
            <Select
              value={geoid}
              onValueChange={(v) => setGeoid(v as "egm2008" | "none")}
              options={[
                { value: "egm2008", label: "Above mean sea level (EGM2008)" },
                { value: "none", label: "Ellipsoidal only" },
              ]}
            />
          </Field>
        </div>
        {error && (
          <HelperText tone="error" role="alert">
            {error}
          </HelperText>
        )}
      </div>
    </Dialog>
  );
}

function FilesCell({ files, target, job, onUploaded }: { files: GnssFile[]; target: string; job: GnssJob; onUploaded: (j: GnssJob) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (list: File[]) => {
    setBusy(true);
    try {
      onUploaded(await uploadGnssFiles(job.id, target, list));
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't upload the files. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept=".ubx,.obs,.nav,.rnx,.crx,.gz,.zip,.21o,.22o,.23o,.24o,.25o,.26o,.21n,.22n,.23n,.24n,.25n,.26n,.21g,.26g"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (list.length) void upload(list);
        }}
      />
      {files.length === 0 ? <span className="caption text-ink-4">No files</span> : files.map((f) => (
        <span key={f.id} className={`caption ${f.uploaded ? "text-ink-2" : "text-ink-4"}`}>
          {f.name} · {bytes(f.size)}
          {!f.uploaded && " (unfinished)"}
        </span>
      ))}
      {job.status !== "queued" && (
        <Button size="sm" variant="quiet" iconStart={Upload01Icon} loading={busy} onClick={() => input.current?.click()}>
          Add
        </Button>
      )}
    </span>
  );
}

function JobPanel({ job, onChange }: { job: GnssJob; onChange: (j: GnssJob) => void }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      onChange(await runGnssJob(job.id));
      toast.success(`${job.code} queued.`);
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't start processing."));
    } finally {
      setBusy(false);
    }
  };
  const sessions = [
    { target: "reference", label: `Reference · ${job.reference.name}`, files: job.reference.files },
    ...(job.base ? [{ target: "base", label: `Base · ${job.base.point_id}`, files: job.base.files }] : []),
    ...job.rovers.map((r) => ({ target: `rover:${r.point_id}`, label: `${r.role === "check" ? "Check" : "GCP"} · ${r.point_id}`, files: r.files })),
  ];
  return (
    <div className="flex flex-col gap-3 rounded-md border border-hairline p-4">
      {job.status === "failed" && job.error && (
        <Alert tone="critical" title="Processing failed">
          {job.error}
        </Alert>
      )}
      {job.warnings?.length ? (
        <Alert tone="warning" title="Warnings">
          <ul>
            {job.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      <Table density="compact" minWidth={560}>
        <THead>
          <Tr>
            <Th>Session</Th>
            <Th>Observation and navigation files</Th>
          </Tr>
        </THead>
        <TBody>
          {sessions.map((s) => (
            <Tr key={s.target}>
              <Td primary>{s.label}</Td>
              <Td>
                <FilesCell files={s.files} target={s.target} job={job} onUploaded={onChange} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" loading={busy} disabled={job.status === "queued"} onClick={() => void run()}>
          {job.status === "completed" || job.status === "failed" ? "Process again" : "Process"}
        </Button>
        <span className="caption text-ink-4">
          Elevation mask {job.elevation_mask_deg}° · {job.geoid === "egm2008" ? "EGM2008 heights" : "ellipsoidal heights"}
          {job.engine ? ` · ${job.engine}` : ""}
        </span>
      </div>
    </div>
  );
}

function Content() {
  const sites = useWorkspaceSites();
  const [jobs, setJobs] = useState<GnssJob[] | null>(null);
  const [points, setPoints] = useState<ControlPoint[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([listGnssJobs(), listControlPoints()]).then(([j, p]) => {
        setJobs(j);
        setPoints(p);
      }),
    []
  );

  useEffect(() => {
    load().catch((err) => {
      console.error("Failed to fetch DGPS jobs:", err);
      setJobs([]);
    });
    listLeases()
      .then(setLeases)
      .catch(() => setLeases([]));
  }, [load]);

  const running = jobs?.some((j) => j.status === "queued");
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => void load().catch(() => undefined), 10_000);
    return () => window.clearInterval(t);
  }, [running, load]);

  const replace = (j: GnssJob) => setJobs((list) => (list ?? []).map((x) => (x.id === j.id ? j : x)));
  const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? "–";

  return (
    <Page>
      <PageHeader
        eyebrow="Minor minerals"
        title="DGPS"
        subtitle="Static GNSS sessions solved with RTKLIB into control-point coordinates for the drone surveys."
        actions={
          <Button variant="primary" iconStart={Add01Icon} onClick={() => setCreating(true)}>
            New job
          </Button>
        }
      />
      <Band first heading="Jobs">
        {!jobs ? (
          <Skeleton height={160} />
        ) : (
          <div className="flex flex-col gap-3">
            <Table minWidth={760} isEmpty={jobs.length === 0} empty="No DGPS jobs yet.">
              <THead>
                <Tr>
                  <Th>Job</Th>
                  <Th>Site</Th>
                  <Th>Reference</Th>
                  <Th numeric>Points</Th>
                  <Th>Created</Th>
                  <Th>Status</Th>
                </Tr>
              </THead>
              <TBody>
                {jobs.map((j) => (
                  <Tr key={j.id} onClick={() => setOpen(open === j.id ? null : j.id)} className="cursor-pointer" aria-expanded={open === j.id}>
                    <Td primary>{j.code}</Td>
                    <Td>{siteName(j.project_id)}</Td>
                    <Td>{j.reference.name}</Td>
                    <Td numeric>{j.rovers.length + (j.base ? 1 : 0)}</Td>
                    <Td>{dateOf(j.created_at)}</Td>
                    <Td>
                      <StatusChip map={GNSS_STATUS} value={j.status} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {open && jobs.find((j) => j.id === open) && <JobPanel job={jobs.find((j) => j.id === open) as GnssJob} onChange={replace} />}
          </div>
        )}
      </Band>
      <Band
        heading="Control points"
        caption="Easting and northing in the site's UTM zone; heights above mean sea level where EGM2008 was applied."
        actions={
          <Button variant="ghost" iconStart={Download01Icon} disabled={points.length === 0} asChild>
            <a href={CONTROL_POINTS_CSV_URL({})} download="control_points.csv">
              CSV
            </a>
          </Button>
        }
      >
        <Table minWidth={980} isEmpty={points.length === 0} empty="Solved points appear here.">
          <THead>
            <Tr>
              <Th>Point</Th>
              <Th>Site</Th>
              <Th numeric>Easting</Th>
              <Th numeric>Northing</Th>
              <Th numeric>Height</Th>
              <Th numeric>σH / σV</Th>
              <Th>Solution</Th>
              <Th numeric>Baseline</Th>
              <Th numeric>Off the plan</Th>
            </Tr>
          </THead>
          <TBody>
            {points.map((p) => (
              <Tr key={p.id}>
                <Td primary>
                  {p.point_id}
                  <span className="caption block text-ink-4">{p.role === "check" ? "Check" : p.role === "base" ? "Base" : "GCP"}</span>
                </Td>
                <Td>{siteName(p.project_id)}</Td>
                <Td numeric>{p.easting.toFixed(3)}</Td>
                <Td numeric>{p.northing.toFixed(3)}</Td>
                <Td numeric>{p.h_msl !== undefined && p.h_msl !== null ? `${p.h_msl.toFixed(3)} MSL` : `${p.h_ellipsoid.toFixed(3)} ell.`}</Td>
                <Td numeric>
                  {(p.sigma_h_m * 100).toFixed(1)} / {(p.sigma_v_m * 100).toFixed(1)} cm
                </Td>
                <Td>
                  <StatusChip map={SOLUTION} value={p.solution} label={`${SOLUTION[p.solution]?.label ?? p.solution} · ${Math.round(p.fix_ratio * 100)} %`} />
                </Td>
                <Td numeric>{(p.baseline_m / 1000).toFixed(2)} km</Td>
                <Td numeric>{p.issued_offset_m !== undefined && p.issued_offset_m !== null ? `${p.issued_offset_m.toFixed(2)} m` : "–"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Band>
      {creating && <NewJob leases={leases} onClose={() => setCreating(false)} onCreated={(j) => (setJobs((list) => [j, ...(list ?? [])]), setOpen(j.id))} />}
    </Page>
  );
}

export function DgpsScreen() {
  return (
    <MMGate>
      <Content />
    </MMGate>
  );
}
