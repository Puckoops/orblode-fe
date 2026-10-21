"use client";

import { Alert, Band, Button, Card, Field, HelperText, Input, Page, PageHeader, Stepper } from "@puckoops/camelot";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { createLease, getLease, setLeaseBoundary, setLeaseStudy, submitLease, updateLease, type LeaseDetail, type LeaseInput } from "@/lib/api/mm";
import { createProject } from "@/lib/api/userSvc";
import { centreOf, type ParsedBoundary } from "@/lib/mm/boundary";
import { thousands } from "@/lib/mm/format";
import { epsgOf, zoneOf } from "@/lib/mm/utm";
import { toast } from "@/lib/toast";
import { useWorkspaces, useWorkspaceSites } from "@/lib/workspaces/store";
import { BoundaryPicker } from "./BoundaryPicker";
import { MMGate } from "./common";
import { Documents } from "./Documents";
import { EMPTY_LEASE, LeaseForm, leaseInput } from "./LeaseForm";

const STEPS = [{ label: "Boundary" }, { label: "Lease details" }, { label: "Documents and submit" }];

const optionalNumber = (raw: string) => (raw.trim() === "" || !Number.isFinite(Number(raw)) ? undefined : Number(raw));

function Content({ siteId, onBack }: { siteId: string | null; onBack: () => void }) {
  const router = useRouter();
  const sites = useWorkspaceSites();
  const workspaceId = useWorkspaces((s) => s.currentId);
  const site = siteId ? sites.find((s) => s.id === siteId) : undefined;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(site?.name ?? "");
  const [madeSite, setMadeSite] = useState<string | null>(null);
  const [lease, setLease] = useState<LeaseDetail | null>(null);
  const [form, setForm] = useState<LeaseInput>(EMPTY_LEASE);
  const [proposed, setProposed] = useState("");
  const [waterTable, setWaterTable] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    if (lease) setLease(await getLease(lease.id));
  };

  // A retry after a failure reuses the site and lease already made, so nothing is made twice.
  const takeBoundary = async (parsed: ParsedBoundary, fileName: string) => {
    const ghat = name.trim() || site?.name || "";
    if (!ghat) {
      setError("Name the ghat or lease block first.");
      return false;
    }
    setError(null);
    try {
      let projectId = siteId ?? madeSite;
      if (!projectId) {
        const centre = centreOf(parsed.geometry);
        projectId = (
          await createProject({
            workspace_id: workspaceId || undefined,
            name: ghat,
            primary_material: "River sand",
            ...(centre ? { center_lat: centre.lat, center_lng: centre.lon, crs_epsg: epsgOf(zoneOf(centre.lon), centre.lat >= 0) } : {}),
          })
        ).id;
        setMadeSite(projectId);
        void useWorkspaces.getState().refresh();
      }
      const made = lease ?? (await createLease({ ...EMPTY_LEASE, name: ghat, project_id: projectId }));
      const saved = await setLeaseBoundary(made.id, parsed.geometry, fileName, parsed.pillars);
      setLease(saved);
      setForm(leaseInput(saved));
      setStep(1);
      return true;
    } catch (err) {
      setError(refusalMessage(err, "Couldn't make the lease site. Try again."));
      return false;
    }
  };

  const saveDetails = async () => {
    if (!lease) return;
    if (!form.name.trim()) {
      setError("Name the ghat or lease block.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateLease(lease.id, form);
      const study = { proposed_m3: optionalNumber(proposed), water_table_depth_m: optionalNumber(waterTable) };
      if (study.proposed_m3 !== undefined || study.water_table_depth_m !== undefined) await setLeaseStudy(lease.id, study);
      setLease(await getLease(lease.id));
      setStep(2);
    } catch (err) {
      setError(refusalMessage(err, "Couldn't save the details. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const projectId = lease?.project_id ?? siteId ?? madeSite;
  const openSite = () => router.push(projectId ? `/projects?site=${encodeURIComponent(projectId)}` : "/projects");

  const submit = async () => {
    if (!lease) return;
    setBusy(true);
    setError(null);
    try {
      await submitLease(lease.id);
      toast.success("Application submitted: the site’s approvers have a notice.");
      openSite();
    } catch (err) {
      setError(refusalMessage(err, "Couldn't submit. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const missingLoi = lease?.checklist.find((i) => i.key === "loi" && !i.document_id);

  return (
    <Page>
      <PageHeader
        eyebrow="Create"
        title={site ? `A lease on ${site.name}` : "New lease site"}
        subtitle="The boundary places the site and its lease; the details and documents make the application."
        back={
          <button type="button" className="hover:underline" onClick={onBack}>
            ← Create
          </button>
        }
      />
      <Stepper steps={STEPS} current={step} onStepClick={(i) => lease && setStep(i)} aria-label="Lease site steps" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <Field label="Ghat or lease block" hint={site ? "The lease's name; the site keeps its own." : "Names the site and its lease."}>
                <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} disabled={Boolean(lease)} />
              </Field>
              {lease?.boundary && (
                <Alert tone="success" title={`Boundary set: ${lease.boundary.source_name}`}>
                  {lease.boundary.pillar_count} corner pillars · {thousands(lease.boundary.area_m2 / 1e4, 2)} ha. Drop another file to replace it.
                </Alert>
              )}
              <BoundaryPicker
                declaredHa={lease?.declared_area_ha ?? 0}
                actionLabel={lease || site ? "Use this boundary" : "Create the site"}
                onUse={takeBoundary}
              />
              {lease && (
                <div>
                  <Button variant="primary" onClick={() => setStep(1)}>
                    Next: lease details
                  </Button>
                </div>
              )}
            </div>
          )}
          {step === 1 && lease && (
            <div className="flex flex-col gap-6">
              <LeaseForm value={form} onChange={setForm} siteLocked hideSite />
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="small font-medium text-ink-1">Study inputs</h3>
                  <HelperText>
                    With a proposed extraction, a replenishment study starts on its own once the site has a pre- and a post-monsoon survey.
                  </HelperText>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Proposed extraction (m³ per year)">
                    <Input inputMode="decimal" value={proposed} onChange={(e) => setProposed(e.target.value)} />
                  </Field>
                  <Field label="Water table depth (m)" hint="Optional. Below the riverbed.">
                    <Input inputMode="decimal" value={waterTable} onChange={(e) => setWaterTable(e.target.value)} />
                  </Field>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="quiet" onClick={() => setStep(0)}>
                  ← Back
                </Button>
                <Button variant="primary" loading={busy} onClick={() => void saveDetails()}>
                  Next: documents
                </Button>
              </div>
            </div>
          )}
          {step === 2 && lease && (
            <div className="flex flex-col gap-4">
              <Documents lease={lease} editable onChange={() => void reload()} />
              <Alert tone="info" title="What happens next">
                Submitting files the application; the site’s approvers are told and register it, which locks the boundary for mission planning.
              </Alert>
              {missingLoi && <HelperText tone="error">Upload the Letter of Intent before submitting.</HelperText>}
              <div className="flex gap-2">
                <Button variant="quiet" onClick={() => setStep(1)}>
                  ← Back
                </Button>
                <Button variant="ghost" onClick={openSite}>
                  Save draft
                </Button>
                <Button variant="primary" loading={busy} disabled={Boolean(missingLoi)} onClick={() => void submit()}>
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
            <li>Lease boundary with corner pillar coordinates</li>
            <li>Letter of Intent or work order</li>
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

/** A new lease site in three steps: the boundary makes the site and its lease, then the lease's details and study
 * inputs, then its documents and submission. With siteId the lease goes on that site of the workspace instead. */
export function NewLeaseSite({ siteId, onBack }: { siteId: string | null; onBack: () => void }) {
  return (
    <MMGate>
      <Content siteId={siteId} onBack={onBack} />
    </MMGate>
  );
}
