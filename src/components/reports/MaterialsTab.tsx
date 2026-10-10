"use client";

import { Add01Icon, Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { Band, Button, IconButton, Input, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import { useState } from "react";
import { Loader } from "@/components/brand/Loader";
import { createMaterial, deleteMaterial, updateMaterial, type Material, type MaterialInput } from "@/lib/api/orblodeSvc";
import { formatValue } from "@/lib/reports";
import { toast } from "@/lib/toast";

interface Form {
  name: string;
  density: string;
  cut: string;
  fill: string;
  value: string;
}

const EMPTY: Form = { name: "", density: "", cut: "1", fill: "1", value: "0" };

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

const formOf = (m: Material): Form => ({
  name: m.name,
  density: String(m.density_t_m3),
  cut: String(m.default_cut_factor),
  fill: String(m.default_fill_factor),
  value: String(m.value_per_t),
});

/** The form as a material, or the reason it isn't one; the bounds are orblode-svc's. */
function inputOf(f: Form): MaterialInput | string {
  const name = f.name.trim();
  const density = Number(f.density);
  const cut = Number(f.cut);
  const fill = Number(f.fill);
  const value = Number(f.value || "0");
  if (!name) return "Name the material";
  if (!Number.isFinite(density) || density < 0 || density > 10) return "Density must be between 0 and 10 t/m³";
  if (!(cut > 0 && cut <= 3) || !(fill > 0 && fill <= 3)) return "Factors must be above 0 and at most 3";
  if (!Number.isFinite(value) || value < 0) return "Value per tonne must be 0 or more";
  return { name, density_t_m3: density, default_cut_factor: cut, default_fill_factor: fill, value_per_t: value };
}

export function MaterialsTab({ projectId, materials, onChanged }: { projectId: string; materials: Material[] | null; onChanged: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);

  if (materials === null) return <Loader label="Loading materials" />;

  const start = (id: string | null, f: Form) => {
    setEditing(id);
    setForm(f);
  };

  const save = async () => {
    const input = inputOf(form);
    if (typeof input === "string") {
      toast.error(input);
      return;
    }
    setBusy(true);
    try {
      if (editing === "new") await createMaterial(projectId, input);
      else if (editing) await updateMaterial(editing, input);
      toast.success(editing === "new" ? `${input.name} added` : `${input.name} saved`);
      setEditing(null);
      onChanged();
    } catch (err) {
      toast.error(message(err, "Couldn't save the material"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: Material) => {
    if (!window.confirm(`Delete ${m.name}? Stockpiles that name it will show an unknown material.`)) return;
    try {
      await deleteMaterial(m.id);
      toast.success(`${m.name} deleted`);
      onChanged();
    } catch (err) {
      toast.error(message(err, "Couldn't delete the material"));
    }
  };

  const field = (key: keyof Form, label: string, type: "text" | "number" = "number") => (
    <Input
      aria-label={label}
      type={type}
      min={type === "number" ? 0 : undefined}
      step={type === "number" ? "any" : undefined}
      className={type === "number" ? "w-24 text-right" : "w-48"}
      value={form[key]}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
    />
  );

  const editRow = (key: string) => (
    <Tr key={key}>
      <Td>{field("name", "Name", "text")}</Td>
      <Td numeric>{field("density", "Density, t/m³")}</Td>
      <Td numeric>{field("cut", "Cut factor")}</Td>
      <Td numeric>{field("fill", "Fill factor")}</Td>
      <Td numeric>{field("value", "Value per tonne")}</Td>
      <Td>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
          <Button size="sm" variant="quiet" disabled={busy} onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </div>
      </Td>
    </Tr>
  );

  return (
    <Band
      heading="Material sheet"
      caption="Stockpiles name a material to turn volume into tonnage and value. The fill factor scales a pile's volume before its density applies."
      actions={
        <Button variant="ghost" size="sm" iconStart={Add01Icon} disabled={editing !== null} onClick={() => start("new", EMPTY)}>
          Add material
        </Button>
      }
      first
    >
      <Table density="compact" isEmpty={materials.length === 0 && editing !== "new"} empty="No materials yet. Add the ones this site stockpiles.">
        <THead>
          <Tr>
            <Th>Material</Th>
            <Th numeric>Density (t/m³)</Th>
            <Th numeric>Cut factor</Th>
            <Th numeric>Fill factor</Th>
            <Th numeric>Value per t</Th>
            <Th />
          </Tr>
        </THead>
        <TBody>
          {materials.map((m) =>
            editing === m.id ? (
              editRow(m.id)
            ) : (
              <Tr key={m.id}>
                <Td primary>{m.name}</Td>
                <Td numeric>{m.density_t_m3}</Td>
                <Td numeric>{m.default_cut_factor}</Td>
                <Td numeric>{m.default_fill_factor}</Td>
                <Td numeric>{formatValue(m.value_per_t)}</Td>
                <Td>
                  <div className="flex justify-end gap-1">
                    <IconButton icon={PencilEdit02Icon} aria-label={`Edit ${m.name}`} size="sm" variant="bare" disabled={editing !== null} onClick={() => start(m.id, formOf(m))} />
                    <IconButton icon={Delete02Icon} aria-label={`Delete ${m.name}`} size="sm" variant="bare" disabled={editing !== null} onClick={() => remove(m)} />
                  </div>
                </Td>
              </Tr>
            )
          )}
          {editing === "new" && editRow("new")}
        </TBody>
      </Table>
    </Band>
  );
}
