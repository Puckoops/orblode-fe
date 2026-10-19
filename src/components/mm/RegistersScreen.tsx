"use client";

import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import {
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from "@puckoops/camelot";
import { useEffect, useMemo, useRef, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import {
  CAMERAS,
  createNogo,
  deleteNogo,
  getSiteLease,
  listDrones,
  listLeases,
  listNogo,
  listVendors,
  saveDrone,
  saveVendor,
  type Drone,
  type GeoJSONGeometry,
  type LeaseDetail,
  type LonLat,
  type NogoFeature,
  type NogoType,
  type Vendor,
} from "@/lib/api/mm";
import { listOrgMembers, type OrgMember } from "@/lib/api/userSvc";
import { BoundaryError, parseGeoJson, parseKml } from "@/lib/mm/boundary";
import { toast } from "@/lib/toast";
import { useWorkspaceSites } from "@/lib/workspaces/store";
import { MMGate } from "./common";
import { LazyMap } from "./LazyMap";
import type { MapArea } from "./MMMap";

const NOGO_TYPES: Record<NogoType, { label: string; keep?: number }> = {
  bridge: { label: "Bridge", keep: 200 },
  water_intake: { label: "Water intake well", keep: 500 },
  habitation: { label: "Habitation", keep: 100 },
  embankment: { label: "Embankment", keep: 50 },
  airspace_yellow: { label: "Airspace: yellow zone" },
  airspace_red: { label: "Airspace: red zone" },
  other: { label: "Other" },
};

function VendorDialog({ vendor, members, onClose, onSaved }: { vendor: Vendor | null; members: OrgMember[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<Omit<Vendor, "id">>(vendor ?? { name: "", contact: "", user_ids: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!v.name.trim()) {
      setError("Name the company.");
      return;
    }
    setBusy(true);
    try {
      await saveVendor(v, vendor?.id);
      toast.success(`${v.name} saved.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(refusalMessage(err, "Couldn't save the vendor."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={vendor ? `Edit ${vendor.name}` : "New vendor"}
      description="A drone survey company. Its people see the missions issued to it and upload the flights."
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Company" required>
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Skyline Geomatics" />
        </Field>
        <Field label="Contact">
          <Input value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })} placeholder="Name, phone" />
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="small mb-1 font-medium text-ink-1">Its people in this organisation</legend>
          <HelperText className="mb-1">Give them a role that uploads mission data on the sites they fly, such as one from the Field vendor template.</HelperText>
          {members.map((m) => (
            <label key={m.user_id} className="small flex items-center gap-2">
              <input
                type="checkbox"
                checked={v.user_ids.includes(m.user_id)}
                onChange={(e) => setV({ ...v, user_ids: e.target.checked ? [...v.user_ids, m.user_id] : v.user_ids.filter((x) => x !== m.user_id) })}
              />
              {m.name || m.email}
              {m.name && m.email && <span className="caption text-ink-4">{m.email}</span>}
            </label>
          ))}
        </fieldset>
        {error && (
          <HelperText tone="error" role="alert">
            {error}
          </HelperText>
        )}
      </div>
    </Dialog>
  );
}

const EMPTY_DRONE: Omit<Drone, "id"> = { vendor_id: "", model: "", camera: "1in_20mp", uin: "", insurance_valid_to: "", pilot: "", rpc_valid_to: "" };

function DroneDialog({ drone, vendors, onClose, onSaved }: { drone: Drone | null; vendors: Vendor[]; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Omit<Drone, "id">>(drone ?? { ...EMPTY_DRONE, vendor_id: vendors[0]?.id ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = (key: keyof Omit<Drone, "id">, label: string, placeholder = "") => (
    <Field label={label}>
      <Input value={d[key]} placeholder={placeholder} onChange={(e) => setD({ ...d, [key]: e.target.value })} />
    </Field>
  );
  const save = async () => {
    if (!d.vendor_id || !d.model.trim() || !d.uin.trim()) {
      setError("Give the vendor, the model and the UIN.");
      return;
    }
    setBusy(true);
    try {
      await saveDrone(d, drone?.id);
      toast.success(`${d.model} saved.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(refusalMessage(err, "Couldn't save the drone."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={drone ? `Edit ${drone.model}` : "New drone"}
      description="Missions check the insurance and the pilot's RPC are valid on the flight date."
      width={640}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Vendor">
          <Select value={d.vendor_id} onValueChange={(vendor_id) => setD({ ...d, vendor_id })} options={vendors.map((v) => ({ value: v.id, label: v.name }))} />
        </Field>
        {text("model", "Model", "DJI Mavic 3 Enterprise")}
        <Field label="Camera">
          <Select value={d.camera} onValueChange={(camera) => setD({ ...d, camera })} options={Object.entries(CAMERAS).map(([value, label]) => ({ value, label }))} />
        </Field>
        {text("uin", "UIN (Digital Sky)", "UA…")}
        {text("insurance_valid_to", "Insurance valid to", "2027-03-31")}
        {text("pilot", "Pilot")}
        {text("rpc_valid_to", "Pilot's RPC valid to", "2028-06-30")}
      </div>
      {error && (
        <HelperText tone="error" role="alert" className="mt-3">
          {error}
        </HelperText>
      )}
    </Dialog>
  );
}

function NogoPanel() {
  const sites = useWorkspaceSites();
  const [leaseSites, setLeaseSites] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [lease, setLease] = useState<LeaseDetail | null>(null);
  const [features, setFeatures] = useState<NogoFeature[]>([]);
  const [draft, setDraft] = useState<{ type: NogoType; name: string; keep: string; geometry: GeoJSONGeometry | null }>({ type: "bridge", name: "", keep: "200", geometry: null });
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listLeases()
      .then((ls) => {
        const ids = ls.map((l) => l.project_id);
        setLeaseSites(ids);
        setProjectId((p) => p ?? ids[0] ?? null);
      })
      .catch(() => setLeaseSites([]));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    getSiteLease(projectId)
      .then(setLease)
      .catch(() => setLease(null));
    listNogo(projectId)
      .then(setFeatures)
      .catch(() => setFeatures([]));
  }, [projectId]);

  const areas = useMemo<MapArea[]>(
    () => [
      ...(lease?.project_id === projectId && lease.boundary_geometry ? [{ id: "lease", kind: "lease" as const, geometry: lease.boundary_geometry }] : []),
      ...features.map((f) => ({ id: f.id, kind: "nogo" as const, geometry: f.geometry, label: f.name })),
      ...(draft.geometry ? [{ id: "draft", kind: "effective" as const, geometry: draft.geometry, label: draft.name || "New place" }] : []),
    ],
    [lease, projectId, features, draft.geometry, draft.name]
  );

  const pick = (at: LonLat) => setDraft((d) => ({ ...d, geometry: { type: "Point", coordinates: [at.lon, at.lat] } }));

  const readZone = async (f: File) => {
    try {
      const text = await f.text();
      const parsed = /\.kml$/i.test(f.name) ? parseKml(text) : parseGeoJson(text);
      setDraft((d) => ({ ...d, geometry: parsed.geometry as GeoJSONGeometry, name: d.name || f.name.replace(/\.[^.]+$/, "") }));
    } catch (err) {
      toast.error(err instanceof BoundaryError ? err.message : "Couldn't read the zone. Use a KML or GeoJSON polygon.");
    }
  };

  const add = async () => {
    if (!projectId || !draft.geometry || !draft.name.trim()) return;
    setBusy(true);
    try {
      const keep = draft.keep.trim() === "" ? undefined : Number(draft.keep);
      await createNogo({ project_id: projectId, type: draft.type, name: draft.name.trim(), keep_m: keep, geometry: draft.geometry });
      setFeatures(await listNogo(projectId));
      setDraft({ type: draft.type, name: "", keep: draft.keep, geometry: null });
      toast.success("Place added.");
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't add the place."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f: NogoFeature) => {
    if (!projectId) return;
    try {
      await deleteNogo(projectId, f.id);
      setFeatures((list) => list.filter((x) => x.id !== f.id));
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't remove the place."));
    }
  };

  if (leaseSites.length === 0) return <HelperText>No-go places are kept per lease site. Start an application first.</HelperText>;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="flex flex-col gap-2">
        <LazyMap areas={areas} onPick={pick} height={520} />
        <HelperText>Click the map to place a bridge, intake well or habitation. Load airspace zones from a KML or GeoJSON polygon.</HelperText>
      </div>
      <div className="flex flex-col gap-5">
        <Field label="Site">
          <SearchSelect
            value={projectId}
            onValueChange={setProjectId}
            placeholder="Choose a site"
            searchPlaceholder="Find a site"
            options={sites.filter((s) => leaseSites.includes(s.id)).map((s) => ({ value: s.id, label: s.name }))}
            empty={() => "No lease site."}
          />
        </Field>
        <Band first heading="Add a place">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Select
                aria-label="Kind of place"
                value={draft.type}
                onValueChange={(v) => setDraft({ ...draft, type: v as NogoType, keep: NOGO_TYPES[v as NogoType].keep?.toString() ?? "" })}
                options={Object.entries(NOGO_TYPES).map(([value, t]) => ({ value, label: t.label }))}
              />
              <Input aria-label="Keep-away distance (m)" value={draft.keep} onChange={(e) => setDraft({ ...draft, keep: e.target.value })} placeholder="Keep away (m)" />
            </div>
            <Input aria-label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="NH-55 bridge" />
            <input
              ref={file}
              type="file"
              hidden
              accept=".kml,.geojson,.json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void readZone(f);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="quiet" onClick={() => file.current?.click()}>
                Load a zone
              </Button>
              <span className="caption text-ink-4">{draft.geometry ? (draft.geometry.type === "Point" ? "Point placed" : "Zone loaded") : "Nothing placed yet"}</span>
            </div>
            <div>
              <Button size="sm" variant="primary" iconStart={Add01Icon} loading={busy} disabled={!draft.geometry || !draft.name.trim()} onClick={() => void add()}>
                Add
              </Button>
            </div>
          </div>
        </Band>
        <Table density="compact" minWidth={360} isEmpty={features.length === 0} empty="No places on this site.">
          <THead>
            <Tr>
              <Th>Place</Th>
              <Th numeric>Keep away</Th>
              <Th>
                <span className="visually-hidden">Remove</span>
              </Th>
            </Tr>
          </THead>
          <TBody>
            {features.map((f) => (
              <Tr key={f.id}>
                <Td primary>
                  {f.name}
                  <span className="caption block text-ink-4">{NOGO_TYPES[f.type]?.label ?? f.type}</span>
                </Td>
                <Td numeric>{f.keep_m ? `${f.keep_m} m` : "Inside"}</Td>
                <Td className="text-right">
                  <IconButton icon={Delete02Icon} aria-label={`Remove ${f.name}`} variant="bare" size="sm" onClick={() => void remove(f)} />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

function Content() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [vendor, setVendor] = useState<Vendor | null | undefined>(undefined);
  const [drone, setDrone] = useState<Drone | null | undefined>(undefined);

  const load = () => {
    listVendors()
      .then(setVendors)
      .catch(() => setVendors([]));
    listDrones()
      .then(setDrones)
      .catch(() => setDrones([]));
  };
  useEffect(() => {
    load();
    listOrgMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  const who = (id: string) => members.find((m) => m.user_id === id)?.email ?? "Someone who left";
  const vendorName = (id: string) => vendors?.find((v) => v.id === id)?.name ?? "–";

  return (
    <Page>
      <PageHeader eyebrow="Minor minerals" title="Registers" subtitle="The vendors and drones missions are issued to, and the places a lease must keep away from." />
      <Tabs defaultValue="vendors">
        <TabsList>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="drones">Drones</TabsTrigger>
          <TabsTrigger value="nogo">No-go places</TabsTrigger>
        </TabsList>
        <TabsContent value="vendors" className="pt-6">
          <Band
            first
            heading="Vendors"
            actions={
              <Button variant="ghost" iconStart={Add01Icon} onClick={() => setVendor(null)}>
                New vendor
              </Button>
            }
          >
            {!vendors ? (
              <Skeleton height={160} />
            ) : (
              <Table minWidth={620} isEmpty={vendors.length === 0} empty="No vendors yet.">
                <THead>
                  <Tr>
                    <Th>Company</Th>
                    <Th>Contact</Th>
                    <Th>People</Th>
                    <Th numeric>Drones</Th>
                  </Tr>
                </THead>
                <TBody>
                  {vendors.map((v) => (
                    <Tr key={v.id} onClick={() => setVendor(v)} className="cursor-pointer">
                      <Td primary>{v.name}</Td>
                      <Td>{v.contact || "–"}</Td>
                      <Td>{v.user_ids.map(who).join(", ") || "–"}</Td>
                      <Td numeric>{drones.filter((d) => d.vendor_id === v.id).length}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Band>
        </TabsContent>
        <TabsContent value="drones" className="pt-6">
          <Band
            first
            heading="Drones"
            actions={
              <Button variant="ghost" iconStart={Add01Icon} disabled={!vendors?.length} onClick={() => setDrone(null)}>
                New drone
              </Button>
            }
          >
            <Table minWidth={760} isEmpty={drones.length === 0} empty={vendors?.length ? "No drones yet." : "Add a vendor first."}>
              <THead>
                <Tr>
                  <Th>Model</Th>
                  <Th>Vendor</Th>
                  <Th>UIN</Th>
                  <Th>Camera</Th>
                  <Th>Insurance to</Th>
                  <Th>Pilot · RPC to</Th>
                </Tr>
              </THead>
              <TBody>
                {drones.map((d) => (
                  <Tr key={d.id} onClick={() => setDrone(d)} className="cursor-pointer">
                    <Td primary>{d.model}</Td>
                    <Td>{vendorName(d.vendor_id)}</Td>
                    <Td>{d.uin}</Td>
                    <Td>{CAMERAS[d.camera] ?? d.camera}</Td>
                    <Td>{d.insurance_valid_to || "–"}</Td>
                    <Td>{[d.pilot, d.rpc_valid_to].filter(Boolean).join(" · ") || "–"}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Band>
        </TabsContent>
        <TabsContent value="nogo" className="pt-6">
          <NogoPanel />
        </TabsContent>
      </Tabs>
      {vendor !== undefined && <VendorDialog vendor={vendor} members={members} onClose={() => setVendor(undefined)} onSaved={load} />}
      {drone !== undefined && vendors && <DroneDialog drone={drone} vendors={vendors} onClose={() => setDrone(undefined)} onSaved={load} />}
    </Page>
  );
}

export function RegistersScreen() {
  return (
    <MMGate>
      <Content />
    </MMGate>
  );
}
