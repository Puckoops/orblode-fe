"use client";

import { Button, Dialog, Field, HelperText, Input, Select } from "@puckoops/camelot";
import { useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { CAMERAS, saveDrone, type Drone, type Vendor } from "@/lib/api/mm";
import { toast } from "@/lib/toast";

const EMPTY_DRONE: Omit<Drone, "id"> = { vendor_id: "", model: "", camera: "1in_20mp", uin: "", insurance_valid_to: "", pilot: "", rpc_valid_to: "" };

/** Adds or changes a vendor's drone, with what missions check on the flight date. */
export function DroneDialog({ drone, vendors, onClose, onSaved }: { drone: Drone | null; vendors: Vendor[]; onClose: () => void; onSaved: () => void }) {
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
