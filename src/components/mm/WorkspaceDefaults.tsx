"use client";

import {
  Add01Icon,
  Cancel01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import {
  Badge,
  Button,
  Card,
  Field,
  HelperText,
  IconButton,
  Input,
  SearchSelect,
  Skeleton,
  Switch,
} from "@puckoops/camelot";
import { useEffect, useState, type FormEvent } from "react";
import { refusalMessage } from "@/lib/api/client";
import {
  getSettings,
  saveSettings,
  type WorkspaceSettings,
} from "@/lib/api/mm";
import {
  listOrgMembers,
  type OrgMember,
  type Workspace,
} from "@/lib/api/userSvc";
import { dateOf } from "@/lib/mm/format";
import { toast } from "@/lib/toast";

type Step = { label: string; reviewer_ids: string[] };

const SUGGESTED = ["Tahasildar", "Sub-Collector", "District Mining Officer"];
const MAX_STEPS = 6;

interface Form {
  chain: Step[];
  station: boolean;
  name: string;
  lat: string;
  lon: string;
  h: string;
  antenna: string;
  spacing: string;
  accuracy: string;
  extraction: string;
}

const formOf = (s: WorkspaceSettings): Form => ({
  chain: s.review_chain.map((c) => ({
    label: c.label,
    reviewer_ids: [...c.reviewer_ids],
  })),
  station: s.reference_station !== null,
  name: s.reference_station?.name ?? "",
  lat: s.reference_station ? String(s.reference_station.lat) : "",
  lon: s.reference_station ? String(s.reference_station.lon) : "",
  h: s.reference_station ? String(s.reference_station.h_ellipsoid) : "",
  antenna: s.reference_station
    ? String(s.reference_station.antenna_height_m)
    : "",
  spacing: String(s.study_defaults.spacing_m),
  accuracy: String(s.study_defaults.vertical_accuracy_m),
  extraction: String(s.study_defaults.max_extraction_pct),
});

const numberIn = (
  raw: string,
  min: number,
  max: number,
  minOpen = false,
): number | null => {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n > max || (minOpen ? n <= min : n < min))
    return null;
  return n;
};

/** What the form would save, or the first thing wrong with it. */
function settingsOf(
  f: Form,
): { settings: Parameters<typeof saveSettings>[0] } | { error: string } {
  const chain = f.chain.map((s) => ({
    label: s.label.trim(),
    reviewer_ids: s.reviewer_ids,
  }));
  if (chain.length === 0 || chain.some((s) => !s.label))
    return { error: "Name every step of the review chain." };
  let station: WorkspaceSettings["reference_station"] = null;
  if (f.station) {
    const lat = numberIn(f.lat, -90, 90);
    const lon = numberIn(f.lon, -180, 180);
    const h = numberIn(f.h, -500, 9000);
    const antenna = numberIn(f.antenna, 0, 10);
    if (!f.name.trim()) return { error: "Name the reference station." };
    if (lat === null || lon === null)
      return {
        error: "Give the station's latitude and longitude in decimal degrees.",
      };
    if (h === null)
      return { error: "Give the station's ellipsoidal height in metres." };
    if (antenna === null)
      return { error: "Give the station's antenna height, 0 to 10 m." };
    station = {
      name: f.name.trim(),
      lat,
      lon,
      h_ellipsoid: h,
      antenna_height_m: antenna,
    };
  }
  const spacing = numberIn(f.spacing, 5, 500);
  const accuracy = numberIn(f.accuracy, 0, 1, true);
  const extraction = numberIn(f.extraction, 0, 100, true);
  if (spacing === null)
    return { error: "Space the sections 5 to 500 m apart." };
  if (accuracy === null)
    return { error: "Give a vertical accuracy above 0 and up to 1 m." };
  if (extraction === null)
    return { error: "Give a maximum extraction above 0 and up to 100%." };
  return {
    settings: {
      review_chain: chain,
      reference_station: station,
      study_defaults: {
        spacing_m: spacing,
        vertical_accuracy_m: accuracy,
        max_extraction_pct: extraction,
      },
    },
  };
}

/** A minor-minerals workspace's defaults, kept by its admins: the chain reports are sent along, the station ground
 * control is solved against, and how studies measure. */
export function WorkspaceDefaults({ workspace }: { workspace: Workspace }) {
  const [saved, setSaved] = useState<WorkspaceSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [people, setPeople] = useState<OrgMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mayEdit = workspace.can_manage;

  useEffect(() => {
    let live = true;
    getSettings(workspace.id)
      .then((s) => {
        if (!live) return;
        setSaved(s);
        setForm(formOf(s));
      })
      .catch(() => live && setFailed(true));
    listOrgMembers()
      .then((m) => live && setPeople(m))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [workspace.id]);

  if (failed)
    return (
      <HelperText tone="error">
        The workspace’s defaults couldn’t load. Reload the page to try again.
      </HelperText>
    );
  if (!form || !saved) return <Skeleton height={280} />;

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const setStep = (i: number, patch: Partial<Step>) =>
    set({
      chain: form.chain.map((s, k) => (k === i ? { ...s, ...patch } : s)),
    });
  const personOf = (id: string) => people?.find((p) => p.user_id === id);
  const nameOf = (id: string) => {
    const p = personOf(id);
    return p ? p.name || p.email || "Unknown account" : "Someone who has left";
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const out = settingsOf(form);
    if ("error" in out) {
      setError(out.error);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const next = await saveSettings(out.settings, workspace.id);
      setSaved(next);
      setForm(formOf(next));
      toast.success("Defaults saved.");
    } catch (err) {
      setError(refusalMessage(err, "Couldn't save the defaults. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form className="flex flex-col gap-8" onSubmit={save} noValidate>
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="small font-medium text-ink-1">Review chain</h3>
            <HelperText>
              Studies sent for vetting start from this chain, in order. Each
              step is decided by any one of its reviewers; the person sending
              can change it, and only reviewers who can vet on the project are
              kept.
            </HelperText>
          </div>
          {form.chain.map((step, i) => {
            const candidates = (people ?? []).filter(
              (p) => !step.reviewer_ids.includes(p.user_id),
            );
            return (
              <fieldset
                key={i}
                className="flex flex-col gap-3 rounded-md border border-hairline p-3"
              >
                <div className="flex items-center gap-2">
                  <span className="caption shrink-0 text-ink-4">
                    Step {i + 1}
                  </span>
                  <Input
                    aria-label={`Name of step ${i + 1}`}
                    value={step.label}
                    maxLength={80}
                    disabled={!mayEdit}
                    onChange={(e) => setStep(i, { label: e.target.value })}
                  />
                  {mayEdit && form.chain.length > 1 && (
                    <IconButton
                      icon={Delete02Icon}
                      aria-label={`Remove step ${i + 1}`}
                      variant="bare"
                      size="sm"
                      onClick={() =>
                        set({ chain: form.chain.filter((_, k) => k !== i) })
                      }
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {step.reviewer_ids.length === 0 && (
                    <span className="caption text-ink-4">
                      No reviewers yet: whoever sends picks them.
                    </span>
                  )}
                  {step.reviewer_ids.map((id) => (
                    <Badge key={id} variant="tag">
                      <span className="inline-flex items-center gap-1">
                        {nameOf(id)}
                        {mayEdit && (
                          <IconButton
                            icon={Cancel01Icon}
                            aria-label={`Take ${nameOf(id)} off step ${i + 1}`}
                            variant="bare"
                            size="sm"
                            onClick={() =>
                              setStep(i, {
                                reviewer_ids: step.reviewer_ids.filter(
                                  (x) => x !== id,
                                ),
                              })
                            }
                          />
                        )}
                      </span>
                    </Badge>
                  ))}
                </div>
                {mayEdit && step.reviewer_ids.length < 20 && (
                  <div className="sm:max-w-sm">
                    <SearchSelect
                      value={null}
                      onValueChange={(id) =>
                        setStep(i, { reviewer_ids: [...step.reviewer_ids, id] })
                      }
                      disabled={people === null}
                      aria-label={`Add a reviewer to step ${i + 1}`}
                      placeholder={
                        people === null ? "Loading people…" : "Add a reviewer…"
                      }
                      searchPlaceholder="Find someone"
                      options={candidates.map((p) => ({
                        value: p.user_id,
                        label: p.name || p.email || "Unknown account",
                        meta: p.name ? p.email : undefined,
                      }))}
                      empty={(query) =>
                        query
                          ? `Nobody matches “${query}”.`
                          : "Everyone in the organisation is on this step."
                      }
                    />
                  </div>
                )}
              </fieldset>
            );
          })}
          {mayEdit && form.chain.length < MAX_STEPS && (
            <div>
              <Button
                type="button"
                size="sm"
                variant="quiet"
                iconStart={Add01Icon}
                onClick={() =>
                  set({
                    chain: [
                      ...form.chain,
                      {
                        label: SUGGESTED[form.chain.length] ?? "",
                        reviewer_ids: [],
                      },
                    ],
                  })
                }
              >
                Add a step
              </Button>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <h3 className="small font-medium text-ink-1">Reference station</h3>
            <HelperText>
              A mission issued here gets a DGPS job solved against this station,
              with a base and the mission’s ground control points as rovers.
            </HelperText>
          </div>
          <Switch
            checked={form.station}
            disabled={!mayEdit}
            onCheckedChange={(station) => set({ station })}
            label="Solve ground control against a reference station"
          />
          {form.station && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                hint="Such as the CORS station's name; the GNSS logs are matched to it by name."
              >
                <Input
                  value={form.name}
                  maxLength={120}
                  disabled={!mayEdit}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </Field>
              <div className="hidden sm:block" />
              <Field label="Latitude" hint="Decimal degrees, WGS 84.">
                <Input
                  inputMode="decimal"
                  value={form.lat}
                  disabled={!mayEdit}
                  onChange={(e) => set({ lat: e.target.value })}
                />
              </Field>
              <Field label="Longitude" hint="Decimal degrees, WGS 84.">
                <Input
                  inputMode="decimal"
                  value={form.lon}
                  disabled={!mayEdit}
                  onChange={(e) => set({ lon: e.target.value })}
                />
              </Field>
              <Field label="Ellipsoidal height (m)">
                <Input
                  inputMode="decimal"
                  value={form.h}
                  disabled={!mayEdit}
                  onChange={(e) => set({ h: e.target.value })}
                />
              </Field>
              <Field label="Antenna height (m)">
                <Input
                  inputMode="decimal"
                  value={form.antenna}
                  disabled={!mayEdit}
                  onChange={(e) => set({ antenna: e.target.value })}
                />
              </Field>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <h3 className="small font-medium text-ink-1">Study defaults</h3>
            <HelperText>
              How replenishment studies measure, whether a planner starts one or
              it starts on its own once both seasons have terrain.
            </HelperText>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Section spacing (m)" hint="5 to 500.">
              <Input
                inputMode="decimal"
                value={form.spacing}
                disabled={!mayEdit}
                onChange={(e) => set({ spacing: e.target.value })}
              />
            </Field>
            <Field
              label="Vertical accuracy (m)"
              hint="Of the terrain; sets the uncertainty."
            >
              <Input
                inputMode="decimal"
                value={form.accuracy}
                disabled={!mayEdit}
                onChange={(e) => set({ accuracy: e.target.value })}
              />
            </Field>
            <Field
              label="Maximum extraction (%)"
              hint="Of the replenished volume."
            >
              <Input
                inputMode="decimal"
                value={form.extraction}
                disabled={!mayEdit}
                onChange={(e) => set({ extraction: e.target.value })}
              />
            </Field>
          </div>
        </section>

        {error && (
          <HelperText tone="error" role="alert">
            {error}
          </HelperText>
        )}
        {mayEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" loading={saving}>
              Save defaults
            </Button>
            {saved.updated_at && (
              <span className="caption text-ink-4">
                Saved {dateOf(saved.updated_at)}
                {saved.updated_by?.email ? ` by ${saved.updated_by.email}` : ""}
              </span>
            )}
          </div>
        ) : (
          <HelperText>
            Only the workspace’s admins and the organisation’s owners and admins
            change its defaults.
          </HelperText>
        )}
      </form>
    </Card>
  );
}
