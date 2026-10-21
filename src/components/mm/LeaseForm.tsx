"use client";

import {
  Field,
  Input,
  SearchSelect,
  Select,
  Textarea,
} from "@puckoops/camelot";
import type { LeaseInput } from "@/lib/api/mm";
import { MINERALS, WORKFLOWS } from "@/lib/mm/format";
import { useWorkspaceSites } from "@/lib/workspaces/store";

export const EMPTY_LEASE: LeaseInput = {
  project_id: "",
  name: "",
  lease_no: "",
  loi_no: "",
  lessee: "",
  river: "",
  district: "",
  tahasil: "",
  mouza: "",
  mineral: "river_sand",
  workflow: "B",
  study_type: "pre_post",
  declared_area_ha: 0,
  permitted_depth_m: 3,
  valid_from: "",
  valid_to: "",
  remarks: "",
};

/** A lease's details. The site is chosen once, when the application starts, unless the application makes it. */
export function LeaseForm({
  value,
  onChange,
  siteLocked,
  takenSites = [],
  hideSite = false,
}: {
  value: LeaseInput;
  onChange: (v: LeaseInput) => void;
  siteLocked?: boolean;
  takenSites?: string[];
  hideSite?: boolean;
}) {
  const sites = useWorkspaceSites();
  const set = <K extends keyof LeaseInput>(key: K, v: LeaseInput[K]) =>
    onChange({ ...value, [key]: v });
  const text = (key: keyof LeaseInput, label: string, placeholder = "") => (
    <Field label={label}>
      <Input
        value={String(value[key] ?? "")}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value as never)}
      />
    </Field>
  );
  const number = (
    key: "declared_area_ha" | "permitted_depth_m",
    label: string,
    step: string,
  ) => (
    <Field label={label}>
      <Input
        type="number"
        step={step}
        min="0"
        value={String(value[key])}
        onChange={(e) => set(key, Number(e.target.value) || 0)}
      />
    </Field>
  );

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
      {!hideSite && (
        <Field
          label="Project"
          required
          hint={
            siteLocked
              ? "The Orblode project this lease belongs to."
              : "One lease per project; its surveys are the lease's."
          }
        >
          {siteLocked ? (
            <Input
              value={
                sites.find((s) => s.id === value.project_id)?.name ??
                value.project_id
              }
              disabled
            />
          ) : (
            <SearchSelect
              value={value.project_id || null}
              onValueChange={(v) => set("project_id", v)}
              placeholder="Choose a project"
              searchPlaceholder="Find a project"
              options={sites
                .filter((s) => !takenSites.includes(s.id))
                .map((s) => ({
                  value: s.id,
                  label: s.name,
                  meta: s.location_name ?? undefined,
                }))}
              empty={(q) =>
                q
                  ? `No project matches “${q}”.`
                  : "Every project of this workspace has a lease."
              }
            />
          )}
        </Field>
      )}
      {text("name", "Ghat or lease block", "Odapada Ghat")}
      {text("lease_no", "Lease number", "DNK/SAND/2026/…")}
      {text("loi_no", "Letter of Intent number")}
      {text("river", "River", "Brahmani")}
      {text("district", "District", "Dhenkanal")}
      {text("tahasil", "Tahasil")}
      {text("mouza", "Mouza or village")}
      {number("declared_area_ha", "Lease area (ha)", "0.01")}
      {number("permitted_depth_m", "Permitted depth (m)", "0.1")}
      {text("lessee", "Lessee or applicant")}
      <Field label="Workflow">
        <Select
          value={value.workflow}
          onValueChange={(v) => set("workflow", v as LeaseInput["workflow"])}
          options={Object.entries(WORKFLOWS).map(([k, label]) => ({
            value: k,
            label,
          }))}
        />
      </Field>
      <Field label="Minor mineral">
        <Select
          value={value.mineral}
          onValueChange={(v) => set("mineral", v)}
          options={Object.entries(MINERALS).map(([k, label]) => ({
            value: k,
            label,
          }))}
        />
      </Field>
      <Field label="Study type">
        <Select
          value={value.study_type}
          onValueChange={(v) =>
            set("study_type", v as LeaseInput["study_type"])
          }
          options={[
            { value: "pre_post", label: "Pre and post monsoon replenishment" },
            {
              value: "post_only",
              label: "Post-monsoon only (baseline exists)",
            },
          ]}
        />
      </Field>
      {text("valid_from", "Valid from", "2026-04")}
      {text("valid_to", "Valid to", "2031-03")}
      <Field label="Remarks" className="col-span-full">
        <Textarea
          rows={2}
          value={value.remarks}
          placeholder="Access road, bridge, intake wells nearby…"
          onChange={(e) => set("remarks", e.target.value)}
        />
      </Field>
    </div>
  );
}

export function leaseInput(l: LeaseInput): LeaseInput {
  return {
    project_id: l.project_id,
    name: l.name,
    lease_no: l.lease_no,
    loi_no: l.loi_no,
    lessee: l.lessee,
    river: l.river,
    district: l.district,
    tahasil: l.tahasil,
    mouza: l.mouza,
    mineral: l.mineral,
    workflow: l.workflow,
    study_type: l.study_type,
    declared_area_ha: l.declared_area_ha,
    permitted_depth_m: l.permitted_depth_m,
    valid_from: l.valid_from,
    valid_to: l.valid_to,
    remarks: l.remarks,
  };
}
