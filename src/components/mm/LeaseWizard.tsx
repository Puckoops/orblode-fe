"use client";

import { Alert, Band, Button, Card, Field, HelperText, Page, PageHeader, SegmentedControl, Select, Stepper } from "@puckoops/camelot";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { createLease, createMission, getLease, listLeases, submitLease, updateLease, type GeoJSONGeometry, type LeaseDetail, type LeaseInput, type Season } from "@/lib/api/mm";
import { createProject, updateProject } from "@/lib/api/userSvc";
import { thousands, WORKFLOWS } from "@/lib/mm/format";
import { epsgOf, zoneOf } from "@/lib/mm/utm";
import { toast } from "@/lib/toast";
import { useWorkspaces, useWorkspaceSites } from "@/lib/workspaces/store";
import { BoundaryUpload } from "./BoundaryUpload";
import { MMGate } from "./common";
import { Documents } from "./Documents";
import { EMPTY_LEASE, LeaseForm } from "./LeaseForm";

const STEPS = [{ label: "Lease details" }, { label: "Boundary" }, { label: "Documents" }, { label: "Survey plan" }, { label: "Submit" }];

/** The mean of a boundary's corners: where the new site's map opens. */
function centreOf(g: GeoJSONGeometry | undefined): { lon: number; lat: number } | null {
  const rings = g?.type === "Polygon" ? (g.coordinates as number[][][]).slice(0, 1) : g?.type === "MultiPolygon" ? (g.coordinates as number[][][][]).map((p) => p[0]) : [];
  const corners = rings.flatMap((r) => r.slice(0, -1));
  if (corners.length === 0) return null;
  return { lon: corners.reduce((a, c) => a + c[0], 0) / corners.length, lat: corners.reduce((a, c) => a + c[1], 0) / corners.length };
}

function Content() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<LeaseInput>(EMPTY_LEASE);
  const [lease, setLease] = useState<LeaseDetail | null>(null);
  const [taken, setTaken] = useState<string[]>([]);
  const sites = useWorkspaceSites();
  const workspaceId = useWorkspaces((s) => s.currentId);
  const [siteMode, setSiteMode] = useState<"new" | "existing">("new");
  const [madeSite, setMadeSite] = useState<string | null>(null);
  const freeSites = sites.filter((s) => !taken.includes(s.id));
  const [season, setSeason] = useState<Season>("pre");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listLeases()
      .then((l) => setTaken(l.map((x) => x.project_id)))
      .catch(() => setTaken([]));
  }, []);

  const reload = async (id = lease?.id) => {
    if (id) setLease(await getLease(id));
  };

  const makingSite = !lease && siteMode === "new";

  const saveDetails = async () => {
    if ((!makingSite && !form.project_id) || !form.name.trim()) {
      setError(makingSite ? "Name the ghat or lease block." : "Choose the site and name the ghat or lease block.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let input = form;
      if (makingSite) {
        const siteId =
          madeSite ??
          (
            await createProject({
              workspace_id: workspaceId,
              name: form.name.trim(),
              location_name: [form.mouza, form.tahasil, form.district].map((p) => p.trim()).filter(Boolean).join(", ") || undefined,
              primary_material: form.mineral === "river_sand" ? "River sand" : undefined,
            })
          ).id;
        setMadeSite(siteId);
        input = { ...form, project_id: siteId };
        setForm(input);
        void useWorkspaces.getState().refresh();
      }
      const saved = lease ? await updateLease(lease.id, input) : await createLease(input);
      await reload(saved.id);
      setStep(1);
    } catch (err) {
      setError(refusalMessage(err, "Couldn't save the application. Try again."));
    } finally {
      setBusy(false);
    }
  };

  // A site the application made has no place yet: the boundary gives it one.
  const boundarySaved = (saved: LeaseDetail) => {
    setLease(saved);
    const centre = centreOf(saved.boundary_geometry);
    if (!madeSite || !centre) return;
    updateProject(madeSite, { center_lat: centre.lat, center_lng: centre.lon, crs_epsg: epsgOf(zoneOf(centre.lon), centre.lat >= 0) })
      .then(() => useWorkspaces.getState().refresh())
      .catch((err) => console.error("Failed to place the new site:", err));
  };

  const draftMission = async () => {
    if (!lease) return;
    setBusy(true);
    try {
      const m = await createMission({ lease_id: lease.id, season });
      toast.success(`${m.code} drafted in the mission planner.`);
      setStep(4);
    } catch (err) {
      setError(refusalMessage(err, "Couldn't draft the mission. You can plan it later from Missions."));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!lease) return;
    setBusy(true);
    setError(null);
    try {
      await submitLease(lease.id);
      toast.success("Application submitted.");
      router.push(`/mm/leases/${lease.id}`);
    } catch (err) {
      setError(refusalMessage(err, "Couldn't submit. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const missingLoi = lease?.checklist.find((i) => i.key === "loi" && !i.document_id);

  return (
    <Page>
      <PageHeader eyebrow="Minor minerals" title="New application" subtitle="Register a ghat or lease block with its boundary and documents." back={<Link href="/mm/leases">← Leases</Link>} />
      <Stepper steps={STEPS} current={step} onStepClick={(i) => lease && setStep(i)} aria-label="Application steps" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          {step === 0 && (
            <div className="flex flex-col gap-4">
              {!lease && freeSites.length > 0 && (
                <SegmentedControl
                  aria-label="Site"
                  value={siteMode}
                  onValueChange={(v) => setSiteMode(v as "new" | "existing")}
                  options={[
                    { value: "new", label: "A new site" },
                    { value: "existing", label: "A site of this workspace" },
                  ]}
                />
              )}
              {makingSite && <HelperText>The application makes a site of this workspace named after the ghat; the boundary places it on the map.</HelperText>}
              <LeaseForm value={form} onChange={setForm} siteLocked={Boolean(lease)} takenSites={taken} hideSite={makingSite} />
              <div>
                <Button variant="primary" loading={busy} onClick={() => void saveDetails()}>
                  Next: boundary
                </Button>
              </div>
            </div>
          )}
          {step === 1 && lease && (
            <div className="flex flex-col gap-4">
              {lease.boundary && (
                <Alert tone={lease.boundary.area_agrees ? "success" : "warning"} title={`Boundary set: ${lease.boundary.source_name}`}>
                  {lease.boundary.pillar_count} corner pillars · {thousands(lease.boundary.area_m2 / 1e4, 2)} ha ({lease.boundary.area_diff_pct >= 0 ? "+" : ""}
                  {lease.boundary.area_diff_pct.toFixed(2)} % against the declared area). Upload another file to replace it.
                </Alert>
              )}
              <BoundaryUpload lease={lease} onSaved={boundarySaved} />
              <div className="flex gap-2">
                <Button variant="quiet" onClick={() => setStep(0)}>
                  ← Back
                </Button>
                <Button variant="primary" onClick={() => setStep(2)}>
                  Next: documents
                </Button>
              </div>
            </div>
          )}
          {step === 2 && lease && (
            <div className="flex flex-col gap-4">
              <Documents lease={lease} editable onChange={() => void reload()} />
              <div className="flex gap-2">
                <Button variant="quiet" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <Button variant="primary" onClick={() => setStep(3)}>
                  Next: survey plan
                </Button>
              </div>
            </div>
          )}
          {step === 3 && lease && (
            <div className="flex flex-col gap-4">
              <Field label="First survey" hint="A draft mission is made in the planner with this lease, its workflow and season.">
                <Select
                  value={season}
                  onValueChange={(v) => setSeason(v as Season)}
                  options={[
                    { value: "pre", label: "Pre-monsoon (S1)" },
                    { value: "post", label: "Post-monsoon (S2)" },
                  ]}
                />
              </Field>
              {!lease.boundary && <HelperText tone="error">Set the boundary first: missions are planned from it.</HelperText>}
              <div className="flex gap-2">
                <Button variant="quiet" onClick={() => setStep(2)}>
                  ← Back
                </Button>
                <Button variant="ghost" onClick={() => setStep(4)}>
                  Plan later
                </Button>
                <Button variant="primary" loading={busy} disabled={!lease.boundary} onClick={() => void draftMission()}>
                  Draft the mission
                </Button>
              </div>
            </div>
          )}
          {step === 4 && lease && (
            <div className="flex flex-col gap-4">
              <ul className="small flex flex-col gap-2">
                <li>{lease.name} · {WORKFLOWS[lease.workflow]}</li>
                <li>{lease.boundary ? `Boundary: ${lease.boundary.pillar_count} pillars, ${thousands(lease.boundary.area_m2 / 1e4, 2)} ha` : "No boundary yet"}</li>
                <li>
                  Documents: {lease.checklist.filter((i) => i.document_id).length} of {lease.checklist.length}
                </li>
              </ul>
              <Alert tone="info" title="What happens next">
                Submitting files the application; the site’s approvers are told and register it, which locks the boundary for mission planning.
              </Alert>
              {(!lease.boundary || missingLoi) && (
                <HelperText tone="error">{!lease.boundary ? "Set the boundary before submitting." : "Upload the Letter of Intent before submitting."}</HelperText>
              )}
              <div className="flex gap-2">
                <Button variant="quiet" onClick={() => setStep(3)}>
                  ← Back
                </Button>
                <Button variant="ghost" asChild>
                  <Link href={`/mm/leases/${lease.id}`}>Save draft</Link>
                </Button>
                <Button variant="primary" loading={busy} disabled={!lease.boundary || Boolean(missingLoi)} onClick={() => void submit()}>
                  Submit application
                </Button>
              </div>
            </div>
          )}
          {error && (
            <HelperText tone="error" role="alert" className="mt-4">
              {error}
            </HelperText>
          )}
        </Card>
        <Band heading="Checklist" caption="What a complete application holds.">
          <ul className="small flex flex-col gap-2 text-ink-2">
            <li>Letter of Intent or work order</li>
            <li>Lease boundary with corner pillar coordinates</li>
            <li>Cadastral map extract (from the Tahasil office)</li>
            <li>Previous DSR entry for this ghat, if any</li>
            <li>Nearest gauge station and discharge record</li>
            <li>Structures within 500 m: bridges, intake wells, embankments</li>
          </ul>
        </Band>
      </div>
    </Page>
  );
}

export function LeaseWizard() {
  return (
    <MMGate>
      <Content />
    </MMGate>
  );
}

