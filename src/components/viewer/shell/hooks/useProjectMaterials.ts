"use client";

// A project's material sheet, for the material picker. A null projectId is
// derived to the stable empty list rather than written from the effect, as
// useProjectDesigns does.

import { useEffect, useState } from "react";

import { listMaterials, type Material } from "@/lib/api/orblodeSvc";

const EMPTY: Material[] = [];

export function useProjectMaterials(projectId: string | null): Material[] | null {
  const [materials, setMaterials] = useState<Material[] | null>(null);

  const [loadedProjectId, setLoadedProjectId] = useState(projectId);
  if (loadedProjectId !== projectId) {
    setLoadedProjectId(projectId);
    setMaterials(null);
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    listMaterials(projectId)
      .then((rows) => {
        if (!cancelled) setMaterials(rows);
      })
      .catch(() => {
        if (!cancelled) setMaterials([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return projectId ? materials : EMPTY;
}
