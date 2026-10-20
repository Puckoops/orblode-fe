"use client";

import { refusalMessage } from "@/lib/api/client";
import { setLeaseBoundary, type LeaseDetail } from "@/lib/api/mm";
import type { ParsedBoundary } from "@/lib/mm/boundary";
import { toast } from "@/lib/toast";
import { BoundaryPicker } from "./BoundaryPicker";

/** Reads a lease boundary from a file in the browser, shows it with its area against the declared one, and
 * saves it when the planner confirms. */
export function BoundaryUpload({ lease, onSaved }: { lease: LeaseDetail; onSaved: (lease: LeaseDetail) => void }) {
  const save = async (parsed: ParsedBoundary, fileName: string) => {
    try {
      onSaved(await setLeaseBoundary(lease.id, parsed.geometry, fileName, parsed.pillars));
      toast.success("Boundary saved.");
      return true;
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't save the boundary. Try again."));
      return false;
    }
  };
  return <BoundaryPicker declaredHa={lease.declared_area_ha} actionLabel="Use this boundary" onUse={save} />;
}
