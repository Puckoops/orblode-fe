"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Loader } from "@/components/brand/Loader";
import { NoWorkspace } from "@/components/workspaces/NoWorkspace";
import { useCesiumReady } from "@/hooks/useCesiumReady";
import { useMinorMinerals } from "@/hooks/useMinorMinerals";
import { useSiteInWorkspace } from "@/hooks/useSiteInWorkspace";
import { sitesHref } from "@/lib/viewer/surveyAccess";
import { useWorkspaces } from "@/lib/workspaces/store";
import { ActiveSitesPanel } from "./ActiveSitesPanel";
import { InstaView, useInstaView } from "./InstaView";
import { SiteDetailPanel } from "./SiteDetailPanel";

const CanvasPlaceholder = () => <Loader variant="fill" label="Loading the globe" />;

const DashboardGlobe = dynamic(() => import("./DashboardGlobe").then((mod) => mod.DashboardGlobe), {
  ssr: false,
  loading: CanvasPlaceholder,
});

/** The current workspace's sites beside a globe of their locations; picking one flies there and opens its details. */
export function GlobeScreen() {
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [linkedSite, setLinkedSite] = useState<string | null>(null);
  const projects = useWorkspaces((s) => s.sites);
  const noWorkspace = useWorkspaces((s) => s.workspaces?.length === 0 && !s.unavailable);
  // DashboardGlobe's chunk resolves the `cesium` external at eval time, so it must not load before window.Cesium exists.
  const cesiumReady = useCesiumReady();
  const insta = useInstaView();
  const minorMinerals = useMinorMinerals();

  // ?site= is read from window.location so the page needs no Suspense boundary.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const site = new URLSearchParams(window.location.search).get("site");
    if (site) {
      setSelectedSiteId(site);
      setLinkedSite(site);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useSiteInWorkspace(selectedSiteId, setSelectedSiteId, linkedSite, false);

  useEffect(() => {
    window.history.replaceState(null, "", sitesHref(selectedSiteId || null));
  }, [selectedSiteId]);

  return (
    <div className="flex h-[calc(100vh-var(--pagehead-h))] w-full overflow-hidden bg-canvas">
      <div className={`z-10 shrink-0 border-r border-hairline ${minorMinerals ? "w-96" : "w-72"}`}>
        {noWorkspace ? (
          <NoWorkspace className="px-5 pt-10" />
        ) : (
          <ActiveSitesPanel projects={projects} selectedSiteId={selectedSiteId} onSiteSelect={setSelectedSiteId} />
        )}
      </div>
      <div className="relative flex-1" {...insta.dropTarget}>
        {cesiumReady ? <DashboardGlobe projects={projects ?? []} selectedSiteId={selectedSiteId} insta={insta} /> : <CanvasPlaceholder />}
        <InstaView insta={insta} />
        {selectedSiteId && <SiteDetailPanel key={selectedSiteId} projectId={selectedSiteId} onClose={() => setSelectedSiteId("")} />}
      </div>
    </div>
  );
}
