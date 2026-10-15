"use client";

import { useMay } from "@/lib/access/sitePermissions";
import { useViewerStore } from "@/lib/viewer/state/store";

/** Whether the person may draw, change and delete measurements on the open survey's site. */
export function useMayMeasure(): boolean {
  const siteId = useViewerStore((s) => s.manifest?.survey.project_id);
  return useMay(siteId, "can_create_measurement");
}
