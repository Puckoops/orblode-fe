"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Loader } from "@/components/brand/Loader";
import { useCesiumReady } from "@/hooks/useCesiumReady";
import { listProjects, type Project } from "@/lib/api/userSvc";
import { ActiveSitesPanel } from "./ActiveSitesPanel";
import { SiteDetailPanel } from "./SiteDetailPanel";

const CanvasPlaceholder = () => <Loader variant="fill" label="Loading the globe" />;

const DashboardGlobe = dynamic(() => import("./DashboardGlobe").then((mod) => mod.DashboardGlobe), {
  ssr: false,
  loading: CanvasPlaceholder,
});

/** Sites beside a globe of their locations; picking one flies there and opens its details. */
export function GlobeScreen() {
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [projects, setProjects] = useState<Project[] | null>(null);
  // DashboardGlobe's chunk resolves the `cesium` external at eval time, so it must not load before window.Cesium exists.
  const cesiumReady = useCesiumReady();

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch((err) => {
        console.error("Failed to fetch projects:", err);
        setProjects([]);
      });
  }, []);

  return (
    <div className="flex h-[calc(100vh-var(--pagehead-h))] w-full overflow-hidden bg-canvas">
      <div className="z-10 w-72 shrink-0 border-r border-hairline">
        <ActiveSitesPanel projects={projects} selectedSiteId={selectedSiteId} onSiteSelect={setSelectedSiteId} />
      </div>
      <div className="relative flex-1">
        {cesiumReady ? <DashboardGlobe projects={projects ?? []} selectedSiteId={selectedSiteId} /> : <CanvasPlaceholder />}
        {selectedSiteId && <SiteDetailPanel key={selectedSiteId} projectId={selectedSiteId} onClose={() => setSelectedSiteId("")} />}
      </div>
    </div>
  );
}
