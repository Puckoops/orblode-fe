"use client";

import { Button, Field, HelperText, Input } from "@puckoops/camelot";
import { useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { setLeaseStudy, type Lease } from "@/lib/api/mm";
import { toast } from "@/lib/toast";

const optionalNumber = (raw: string) => (raw.trim() === "" || !Number.isFinite(Number(raw)) ? undefined : Number(raw));
const shown = (n: number | undefined) => (n == null ? "" : String(n));

/** What a lease's replenishment studies measure against. A field left empty keeps its saved value. */
export function StudyInputs({ lease, editable, compact = false, onSaved }: { lease: Lease; editable: boolean; compact?: boolean; onSaved: (l: Lease) => void }) {
  const [proposed, setProposed] = useState(shown(lease.study?.proposed_m3));
  const [waterTable, setWaterTable] = useState(shown(lease.study?.water_table_depth_m));
  const [saving, setSaving] = useState(false);
  const changed = optionalNumber(proposed) !== lease.study?.proposed_m3 || optionalNumber(waterTable) !== lease.study?.water_table_depth_m;

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await setLeaseStudy(lease.id, { proposed_m3: optionalNumber(proposed), water_table_depth_m: optionalNumber(waterTable) }));
      toast.success("Study inputs saved.");
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't save the study inputs."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className={`grid gap-3 ${compact ? "grid-cols-2" : "sm:max-w-lg sm:grid-cols-2"}`}>
        <Field label={compact ? "Proposed (m³/yr)" : "Proposed extraction (m³ per year)"}>
          <Input inputMode="decimal" value={proposed} disabled={!editable} onChange={(e) => setProposed(e.target.value)} />
        </Field>
        <Field label={compact ? "Water table (m)" : "Water table depth (m)"}>
          <Input inputMode="decimal" value={waterTable} disabled={!editable} onChange={(e) => setWaterTable(e.target.value)} />
        </Field>
      </div>
      {editable && changed && (
        <div>
          <Button size="sm" variant="ghost" loading={saving} onClick={() => void save()}>
            Save
          </Button>
        </div>
      )}
      {lease.study?.proposed_m3 == null && <HelperText>With a proposed extraction, a study starts on its own once both seasons have terrain.</HelperText>}
    </div>
  );
}
