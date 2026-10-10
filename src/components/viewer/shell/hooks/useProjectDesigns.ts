"use client";

// A project's designs with their surfaces, for the design-surface base picker
// and the Designs panel. `reload` fetches again (after a design is processed).
// A null projectId is derived to the stable empty list rather than written
// from the effect, as useCompareSurveys does.

import { useCallback, useEffect, useState } from "react";

import { listDesigns, type DesignRecord } from "@/lib/api/orblodeSvc";

const EMPTY: DesignRecord[] = [];

export function useProjectDesigns(projectId: string | null): {
  /** null while loading; [] once loaded (or on failure / no project). */
  designs: DesignRecord[] | null;
  reload: () => void;
} {
  const [designs, setDesigns] = useState<DesignRecord[] | null>(null);
  const [version, setVersion] = useState(0);

  const [loadedProjectId, setLoadedProjectId] = useState(projectId);
  if (loadedProjectId !== projectId) {
    setLoadedProjectId(projectId);
    setDesigns(null);
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    listDesigns(projectId)
      .then((res) => {
        if (!cancelled) setDesigns(res.designs ?? []);
      })
      .catch(() => {
        if (!cancelled) setDesigns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { designs: projectId ? designs : EMPTY, reload };
}
