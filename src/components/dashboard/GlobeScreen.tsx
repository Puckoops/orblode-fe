"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Loader } from "@/components/brand/Loader";
import { NoWorkspace } from "@/components/workspaces/NoWorkspace";
import { useCesiumReady } from "@/hooks/useCesiumReady";
import { useSiteInWorkspace } from "@/hooks/useSiteInWorkspace";
import { useWorkspaces } from "@/lib/workspaces/store";
import { ActiveSitesPanel } from "./ActiveSitesPanel";
import { SiteDetailPanel } from "./SiteDetailPanel";

const CanvasPlaceholder = () => <Loader variant="fill" label="Loading the globe" />;

const DashboardGlobe = dynamic(() => import("./DashboardGlobe").then((mod) => mod.DashboardGlobe), {
  ssr: false,
  loading: CanvasPlaceholder,
});

/** The current workspace's sites beside a globe of their locations; picking one flies there and opens its details. */
export function GlobeScreen() {
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const projects = useWorkspaces((s) => s.sites);
  const noWorkspace = useWorkspaces((s) => s.workspaces?.length === 0 && !s.unavailable);
  // DashboardGlobe's chunk resolves the `cesium` external at eval time, so it must not load before window.Cesium exists.
  const cesiumReady = useCesiumReady();
  useSiteInWorkspace(selectedSiteId, setSelectedSiteId, null, false);

  return (
    <div className="flex h-[calc(100vh-var(--pagehead-h))] w-full overflow-hidden bg-canvas">
      <div className="z-10 w-72 shrink-0 border-r border-hairline">
        {noWorkspace ? (
          <NoWorkspace className="px-5 pt-10" />
        ) : (
          <ActiveSitesPanel projects={projects} selectedSiteId={selectedSiteId} onSiteSelect={setSelectedSiteId} />
        )}
      </div>
      <div className="relative flex-1">
        {cesiumReady ? <DashboardGlobe projects={projects ?? []} selectedSiteId={selectedSiteId} /> : <CanvasPlaceholder />}
        {selectedSiteId && <SiteDetailPanel key={selectedSiteId} projectId={selectedSiteId} onClose={() => setSelectedSiteId("")} />}
      </div>
    </div>
  );
}
