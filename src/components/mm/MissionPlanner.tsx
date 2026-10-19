"use client";

import { Download01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import {
  Alert,
  Band,
  Button,
  Chip,
  DateInput,
  Dialog,
  Field,
  HelperText,
  Input,
  Page,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Slider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  type IsoDate,
} from "@puckoops/camelot";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import {
  acceptMission,
  approveMove,
  CAMERAS,
  getLease,
  getMission,
  issueMission,
  listDrones,
  listVendors,
  markFlown,
  missionEvents,
  missionGeometry,
  MOVE_REASONS,
  moveGCP,
  resetGCP,
  returnMission,
  updateMission,
  type Drone,
  type GCP,
  type LeaseDetail,
  type LonLat,
  type Mission,
  type MissionEvent,
  type MissionGeometry,
  type MissionSettings,
  type Vendor,
} from "@/lib/api/mm";
import { useMay } from "@/lib/access/sitePermissions";
import { flightPlanKml, gcpCsv, litchiCsv, missionPack, preflightChecklist, saveFile } from "@/lib/mm/exports";
import { dateTimeOf, WORKFLOWS } from "@/lib/mm/format";
import { toUtm } from "@/lib/mm/utm";
import { toast } from "@/lib/toast";
import { CHECK_STATE, MISSION_STATUS, MMGate, StatusChip, useFollowSite, useSitePermissionsLoad } from "./common";
import { FlightUpload } from "./FlightUpload";
import { LazyMap } from "./LazyMap";
import type { MapArea, MapPoint } from "./MMMap";

const REASON_LIMIT_M = 20;
const APPROVAL_LIMIT_M = 50;

function metresBetween(a: LonLat, b: LonLat): number {
  const p = toUtm(a.lon, a.lat);
  const q = toUtm(b.lon, b.lat, p.zone);
  return Math.hypot(q.easting - p.easting, q.northing - p.northing);
}

function MoveDialog({ point, to, onCancel, onMove }: { point: GCP; to: LonLat; onCancel: () => void; onMove: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState(point.reason || "");
  const [busy, setBusy] = useState(false);
  const d = metresBetween(point.auto, to);
  const refused = d > APPROVAL_LIMIT_M;
  const needsApproval = d > REASON_LIMIT_M;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onCancel()}
      title={`Move ${point.id} ${d.toFixed(1)} m`}
      description={`${point.role === "gcp" ? "Ground control point" : "Check point"} · ${point.where}. The software position is kept beside the move in the mission's trace.`}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onCancel}>
            Put it back
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={refused || (d >= 1 && !reason)}
            onClick={async () => {
              setBusy(true);
              await onMove(reason);
              setBusy(false);
            }}
          >
            Move
          </Button>
        </>
      }
    >
      {refused ? (
        <Alert tone="critical" title={`More than ${APPROVAL_LIMIT_M} m from where the planner put it`}>
          Change the buffer or the layout instead, so the control still covers the lease.
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          {needsApproval && (
            <Alert tone="warning" title={`Over ${REASON_LIMIT_M} m: a reviewer must approve it`}>
              Someone with approval rights on the site, other than you, approves the move before the mission can be issued.
            </Alert>
          )}
          <Field label="Why it moves" required>
            <Select value={reason} onValueChange={setReason} placeholder="Choose a reason" options={MOVE_REASONS.map((r) => ({ value: r, label: r }))} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function SettingsPanel({ mission, editable, onChange }: { mission: Mission; editable: boolean; onChange: (s: MissionSettings) => void }) {
  const [s, setS] = useState(mission.settings);
  const commit = (next: MissionSettings) => {
    setS(next);
    onChange(next);
  };
  const slider = (key: keyof MissionSettings, label: string, min: number, max: number, step: number, unit: string) => (
    <Slider
      label={label}
      value={[s[key] as number]}
      min={min}
      max={max}
      step={step}
      format={(v) => `${v} ${unit}`}
      disabled={!editable}
      onValueChange={([v]) => setS({ ...s, [key]: v })}
      onValueCommit={([v]) => commit({ ...s, [key]: v })}
    />
  );
  return (
    <div className="flex flex-col gap-5">
      <Field label="Camera">
        <Select value={s.camera} onValueChange={(v) => commit({ ...s, camera: v })} options={Object.entries(CAMERAS).map(([value, label]) => ({ value, label }))} disabled={!editable} />
      </Field>
      {slider("altitude_m", "Height above ground", 40, 120, 5, "m")}
      {slider("front_overlap", "Front overlap", 60, 90, 5, "%")}
      {slider("side_overlap", "Side overlap", 50, 85, 5, "%")}
      {slider("speed_ms", "Speed", 3, 15, 1, "m/s")}
      {slider("buffer_m", "Survey buffer beyond the lease", 0, 150, 5, "m")}
      {slider("safety_zone_m", "Safety zone beyond the buffer", 0, 100, 5, "m")}
      <Field label="Flight lines">
        <SegmentedControl
          aria-label="Flight lines"
          value={s.direction}
          onValueChange={(v) => editable && commit({ ...s, direction: v })}
          options={[
            { value: "along", label: "Along the river" },
            { value: "across", label: "Across" },
          ]}
        />
      </Field>
      <Field label="Pattern">
        <SegmentedControl
          aria-label="Pattern"
          value={s.pattern}
          onValueChange={(v) => editable && commit({ ...s, pattern: v })}
          options={[
            { value: "single", label: "Single grid" },
            { value: "double", label: "Double grid" },
          ]}
        />
      </Field>
      <Field label="Ground control">
        <SegmentedControl
          aria-label="Ground control"
          value={s.control_method}
          onValueChange={(v) => editable && commit({ ...s, control_method: v })}
          options={[
            { value: "targets", label: "Painted targets" },
            { value: "smart", label: "Smart GCPs" },
          ]}
        />
      </Field>
    </div>
  );
}

function ControlPanel({
  mission,
  editable,
  canApprove,
  onReset,
  onApprove,
}: {
  mission: Mission;
  editable: boolean;
  canApprove: boolean;
  onReset: (pid: string) => void;
  onApprove: (pid: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <HelperText>
        {editable ? `Drag a point on the map to move it. Up to ${REASON_LIMIT_M} m needs a reason, up to ${APPROVAL_LIMIT_M} m a reviewer's approval.` : "The mission is issued: ground control is fixed."}
      </HelperText>
      <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
        {mission.gcps.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="small min-w-12 font-semibold text-ink-1">{p.id}</span>
            <span className="caption flex-1 text-ink-3">
              {p.role === "gcp" ? "GCP" : "Check"} · {p.where}
              {p.moved_m >= 0.5 && ` · moved ${p.moved_m.toFixed(1)} m ${p.bearing ?? ""}${p.reason ? ` · ${p.reason}` : ""}`}
            </span>
            {p.approval === "pending" && (
              <Chip tone="amber" glyph="triangle">
                Needs approval
              </Chip>
            )}
            {p.approval === "approved" && (
              <Chip tone="teal" glyph="check">
                Approved{p.approver ? ` by ${p.approver.email}` : ""}
              </Chip>
            )}
            {p.approval === "pending" && canApprove && (
              <Button size="sm" variant="ghost" onClick={() => onApprove(p.id)}>
                Approve
              </Button>
            )}
            {editable && p.moved_m >= 0.5 && (
              <Button size="sm" variant="quiet" onClick={() => onReset(p.id)}>
                Reset
              </Button>
            )}
          </li>
        ))}
      </ul>
      {editable && mission.gcps.some((p) => p.moved_m >= 0.5) && (
        <div>
          <Button size="sm" variant="quiet" onClick={() => onReset("*")}>
            Put every point back
          </Button>
        </div>
      )}
    </div>
  );
}

function Content({ missionId }: { missionId: string }) {
  const [mission, setMission] = useState<Mission | null>(null);
  const [geometry, setGeometry] = useState<MissionGeometry | null>(null);
  const [lease, setLease] = useState<LeaseDetail | null>(null);
  const [events, setEvents] = useState<MissionEvent[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [failed, setFailed] = useState(false);
  const [moving, setMoving] = useState<{ point: GCP; to: LonLat } | null>(null);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const projectId = mission?.project_id;
  useSitePermissionsLoad(projectId);
  useFollowSite(projectId);
  const canPlan = useMay(projectId, "can_plan_mission");
  const canApprove = useMay(projectId, "can_approve");
  const canFly = useMay(projectId, "can_upload_mission_data");

  const refresh = useCallback(
    (m?: Mission) =>
      (m ? Promise.resolve(m) : getMission(missionId)).then((next) => {
        setMission(next);
        return Promise.all([missionGeometry(missionId), missionEvents(missionId)]).then(([g, e]) => {
          setGeometry(g);
          setEvents(e);
          return next;
        });
      }),
    [missionId]
  );

  useEffect(() => {
    refresh()
      .then((m) => getLease(m.lease_id).then(setLease))
      .catch((err) => {
        console.error("Failed to fetch the mission:", err);
        setFailed(true);
      });
    listVendors()
      .then(setVendors)
      .catch(() => setVendors([]));
    listDrones()
      .then(setDrones)
      .catch(() => setDrones([]));
  }, [refresh]);


  const areas = useMemo<MapArea[]>(
    () =>
      geometry
        ? [
            { id: "safety", kind: "safety", geometry: geometry.safety },
            { id: "buffer", kind: "buffer", geometry: geometry.buffer },
            { id: "lease", kind: "lease", geometry: geometry.lease },
            ...geometry.nogo.map((n) => ({ id: n.id, kind: "nogo" as const, geometry: n.geometry, label: n.name })),
          ]
        : [],
    [geometry]
  );
  const points = useMemo<MapPoint[]>(
    () =>
      (mission?.gcps ?? []).map((p) => ({
        id: p.id,
        at: p.final,
        auto: p.auto,
        tone: p.approval === "pending" ? "pending" : p.moved_m >= 0.5 ? "moved" : p.role === "gcp" ? "gcp" : "check",
        label: p.id,
        rings: moving?.point.id === p.id ? [REASON_LIMIT_M, APPROVAL_LIMIT_M] : undefined,
      })),
    [mission, moving]
  );

  if (failed) return <Alert tone="critical" title="This mission couldn't load.">It may belong to a site you can’t see.</Alert>;
  if (!mission || !geometry) return <Skeleton height={520} />;

  const editable = canPlan && (mission.status === "draft" || mission.status === "returned");
  const issued = ["issued", "accepted", "flown", "received"].includes(mission.status);
  const failing = mission.checks.filter((c) => c.state === "no");
  const vendor = vendors.find((v) => v.id === mission.vendor_id);
  const vendorDrones = drones.filter((d) => d.vendor_id === mission.vendor_id);
  const drone = vendorDrones.find((d) => d.id === mission.drone_id);
  const leaseName = lease?.name ?? mission.code;

  const run = async (key: string, fn: () => Promise<Mission>, done?: string) => {
    setBusy(key);
    try {
      await refresh(await fn());
      if (done) toast.success(done);
    } catch (err) {
      toast.error(refusalMessage(err, "That didn't work. Try again."));
      await refresh().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const drop = (pid: string, to: LonLat) => {
    const point = mission.gcps.find((p) => p.id === pid);
    if (!point || !editable) {
      setMission({ ...mission });
      return;
    }
    setMoving({ point, to });
  };

  const exportAs = (kind: "pack" | "kml" | "litchi" | "gcp" | "checklist") => {
    const v = vendor?.name ?? "";
    const d = drone ? `${drone.model} (${drone.uin})` : "";
    switch (kind) {
      case "pack":
        return saveFile(`${mission.code}_mission_pack.zip`, missionPack(mission, geometry, leaseName, v, d), "application/zip");
      case "kml":
        return saveFile(`${mission.code}_flight_plan.kml`, flightPlanKml(mission, geometry, leaseName), "application/vnd.google-earth.kml+xml");
      case "litchi":
        return saveFile(`${mission.code}_litchi.csv`, litchiCsv(mission, geometry), "text/csv");
      case "gcp":
        return saveFile(`${mission.code}_gcp_layout.csv`, gcpCsv(mission.gcps), "text/csv");
      case "checklist":
        return saveFile(`${mission.code}_preflight.txt`, preflightChecklist(mission, leaseName, v, d), "text/plain");
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Minor minerals · mission"
        title={mission.code}
        subtitle={[leaseName, mission.season === "post" ? "post-monsoon" : "pre-monsoon", WORKFLOWS[mission.workflow]].join(" · ")}
        back={<Link href="/mm/missions">← Missions</Link>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip map={MISSION_STATUS} value={mission.status} />
            {editable && (
              <Button variant="primary" loading={busy === "issue"} disabled={failing.length > 0} onClick={() => void run("issue", () => issueMission(mission.id), `${mission.code} issued.`)}>
                Issue to vendor
              </Button>
            )}
            {issued && (canFly || canPlan) && (
              <Button variant="ghost" iconStart={Upload01Icon} onClick={() => setUploading(true)}>
                Upload a flight
              </Button>
            )}
          </div>
        }
      />
      {mission.status === "returned" && mission.return_note && (
        <Alert tone="warning" title="The vendor returned this mission">
          {mission.return_note}
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="flex flex-col gap-3">
          <LazyMap areas={areas} lines={geometry.lines} points={points} draggable={editable} onDrop={drop} height={620} />
          <div className="caption flex flex-wrap gap-x-5 gap-y-1 text-ink-3">
            <span>{mission.stats.area_ha.toFixed(2)} ha surveyed</span>
            <span>GSD {mission.stats.gsd_cm.toFixed(1)} cm</span>
            <span>{mission.stats.lines} lines, {Math.round(mission.stats.line_m)} m apart</span>
            <span>{mission.stats.photos} photos</span>
            <span>{mission.stats.minutes} min · {mission.stats.batteries} batteries</span>
          </div>
        </div>
        <Tabs defaultValue={issued ? "handoff" : "flight"}>
          <TabsList>
            <TabsTrigger value="flight">Flight</TabsTrigger>
            <TabsTrigger value="control" count={mission.gcps.filter((p) => p.approval === "pending").length || undefined}>
              Control
            </TabsTrigger>
            <TabsTrigger value="checks" count={failing.length || undefined}>
              Checks
            </TabsTrigger>
            <TabsTrigger value="handoff">Hand-off</TabsTrigger>
            <TabsTrigger value="trace">Trace</TabsTrigger>
          </TabsList>
          <TabsContent value="flight" className="pt-4">
            <SettingsPanel key={JSON.stringify(mission.settings)} mission={mission} editable={editable} onChange={(settings) => void run("settings", () => updateMission(mission.id, { settings }))} />
          </TabsContent>
          <TabsContent value="control" className="pt-4">
            <ControlPanel
              mission={mission}
              editable={editable}
              canApprove={canApprove}
              onReset={(pid) => void run("reset", () => resetGCP(mission.id, pid))}
              onApprove={(pid) => void run("approve", () => approveMove(mission.id, pid), `${pid} move approved.`)}
            />
          </TabsContent>
          <TabsContent value="checks" className="pt-4">
            <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
              {mission.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-3 px-3 py-2">
                  <StatusChip map={CHECK_STATE} value={c.state} />
                  <span className="min-w-0 flex-1">
                    <span className="small block text-ink-1">{c.label}</span>
                    <span className="caption block text-ink-4">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {failing.length > 0 && <HelperText className="mt-3">Fix the failing checks to issue the mission. The server checks them again when you issue it.</HelperText>}
          </TabsContent>
          <TabsContent value="handoff" className="flex flex-col gap-5 pt-4">
            <Band first heading="Vendor and window">
              <div className="flex flex-col gap-4">
                <Field label="Vendor" hint={vendors.length === 0 ? "Add vendors under Registers." : undefined}>
                  <Select
                    value={mission.vendor_id ?? ""}
                    onValueChange={(v) => void run("vendor", () => updateMission(mission.id, { vendor_id: v }))}
                    placeholder="Choose a vendor"
                    options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                    disabled={!editable}
                  />
                </Field>
                <Field label="Drone">
                  <Select
                    value={mission.drone_id ?? ""}
                    onValueChange={(v) => void run("drone", () => updateMission(mission.id, { drone_id: v }))}
                    placeholder={mission.vendor_id ? "Choose a drone" : "Choose the vendor first"}
                    options={vendorDrones.map((d) => ({ value: d.id, label: `${d.model} · ${d.uin}` }))}
                    disabled={!editable || !mission.vendor_id}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fly from">
                    <DateInput
                      value={(mission.flight_from as IsoDate) || null}
                      onChange={(v) => void run("from", () => updateMission(mission.id, { flight_from: v ?? "" }))}
                      disabled={!editable}
                      clearable
                    />
                  </Field>
                  <Field label="Window">
                    <Input
                      defaultValue={mission.window ?? ""}
                      placeholder="07:00–11:00, low wind"
                      disabled={!editable}
                      onBlur={(e) => e.target.value !== (mission.window ?? "") && void run("window", () => updateMission(mission.id, { window: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>
            </Band>
            <Band heading="Field files" caption={issued ? "For the pilot and the DGPS crew." : "Ready once the mission is issued."}>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" iconStart={Download01Icon} disabled={!issued} onClick={() => exportAs("pack")}>
                  Mission pack (ZIP)
                </Button>
                <Button variant="ghost" size="sm" disabled={!issued} onClick={() => exportAs("kml")}>
                  KML
                </Button>
                <Button variant="ghost" size="sm" disabled={!issued} onClick={() => exportAs("litchi")}>
                  Litchi CSV
                </Button>
                <Button variant="ghost" size="sm" disabled={!issued} onClick={() => exportAs("gcp")}>
                  GCP layout
                </Button>
                <Button variant="ghost" size="sm" disabled={!issued} onClick={() => exportAs("checklist")}>
                  Pre-flight checklist
                </Button>
              </div>
            </Band>
            {(mission.status === "issued" || mission.status === "accepted") && (canFly || canPlan) && (
              <Band heading="Vendor">
                <div className="flex flex-wrap gap-2">
                  {mission.status === "issued" && (
                    <Button variant="primary" size="sm" loading={busy === "accept"} onClick={() => void run("accept", () => acceptMission(mission.id), "Mission accepted.")}>
                      Accept mission
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" loading={busy === "flown"} onClick={() => void run("flown", () => markFlown(mission.id), "Marked flown.")}>
                    Mark flown
                  </Button>
                  <Button variant="quiet" size="sm" onClick={() => setReturning(true)}>
                    Return to planner
                  </Button>
                </div>
              </Band>
            )}
            {mission.survey_ids.length > 0 && (
              <Band heading="Flights">
                <ul className="small flex flex-col gap-1">
                  {mission.survey_ids.map((id) => (
                    <li key={id}>
                      <Link href={`/viewer/${id}`} className="text-accent hover:underline">
                        Survey {id.slice(-6)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Band>
            )}
          </TabsContent>
          <TabsContent value="trace" className="pt-4">
            <ol className="flex flex-col gap-2">
              {events.map((e) => (
                <li key={e.id} className="caption border-l-2 border-hairline pl-3 text-ink-2">
                  <span className="block text-ink-1">{e.text}</span>
                  <span className="text-ink-4">
                    {e.by.email} · {dateTimeOf(e.at)}
                  </span>
                </li>
              ))}
            </ol>
          </TabsContent>
        </Tabs>
      </div>

      {moving && (
        <MoveDialog
          point={moving.point}
          to={moving.to}
          onCancel={() => {
            setMoving(null);
            setMission({ ...mission });
          }}
          onMove={async (reason) => {
            await run("move", () => moveGCP(mission.id, moving.point.id, moving.to, reason));
            setMoving(null);
          }}
        />
      )}
      {returning && (
        <Dialog
          open
          onOpenChange={(o) => !o && setReturning(false)}
          title={`Return ${mission.code}`}
          description="Say what the planner has to change: the window, the layout, access to a point."
          footer={
            <>
              <Button variant="quiet" onClick={() => setReturning(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!note.trim()}
                loading={busy === "return"}
                onClick={() =>
                  void run("return", () => returnMission(mission.id, note), "Mission returned.").then(() => {
                    setReturning(false);
                    setNote("");
                  })
                }
              >
                Return
              </Button>
            </>
          }
        >
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="P4 sits in standing water; the access road is closed until the 28th." />
        </Dialog>
      )}
      {uploading && <FlightUpload mission={mission} onClose={() => setUploading(false)} onDone={() => void refresh()} />}
    </Page>
  );
}

export function MissionPlanner({ missionId }: { missionId: string }) {
  return (
    <MMGate anyWorkspace>
      <Content missionId={missionId} />
    </MMGate>
  );
}
