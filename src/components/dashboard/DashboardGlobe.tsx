"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Viewer, Entity, PointGraphics } from "resium";
import type { CesiumComponentRef } from "resium";
import { Cartesian3, Color, Viewer as CesiumViewer } from "cesium";
import type { Project } from "@/lib/api/userSvc";
import { projectWgs84Center, resolveProjectCenter, type Wgs84Center } from "@/lib/dashboard/resolveProjectCenter";
import { SITE_MARKER } from "@/lib/viewer/sceneStyle";
import type { InstaViewState } from "./InstaView";
import { InstaViewLayer } from "./InstaViewLayer";

const MARKER_FILL = Color.fromCssColorString(SITE_MARKER.fill);
const MARKER_OUTLINE = Color.fromCssColorString(SITE_MARKER.outline);

export function DashboardGlobe({
  projects,
  selectedSiteId,
  insta,
}: {
  projects: Project[];
  selectedSiteId?: string;
  insta: Pick<InstaViewState, "overlays" | "focus" | "loaded" | "failed">;
}) {
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer> | null>(null);
  const centersRef = useRef<Map<string, Wgs84Center>>(new Map());
  const [viewerReady, setViewerReady] = useState(false);
  const [markerCenters, setMarkerCenters] = useState<Record<string, Wgs84Center>>({});

  const handleViewerRef = useCallback((ref: CesiumComponentRef<CesiumViewer> | null) => {
    viewerRef.current = ref;
    if (ref?.cesiumElement && !ref.cesiumElement.isDestroyed()) {
      setViewerReady(true);
    }
  }, []);

  // listProjects may omit center_lat/center_lng for some sites; those resolve through the project
  // detail, then the latest survey's manifest.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const next: Record<string, Wgs84Center> = {};
      for (const project of projects) {
        const cached = centersRef.current.get(project.id);
        if (cached) {
          next[project.id] = cached;
          continue;
        }

        const immediate = projectWgs84Center(project);
        if (immediate) {
          next[project.id] = immediate;
          centersRef.current.set(project.id, immediate);
          continue;
        }

        const resolved = await resolveProjectCenter(project);
        if (resolved) {
          next[project.id] = resolved;
          centersRef.current.set(project.id, resolved);
        }
      }

      if (!cancelled) setMarkerCenters(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [projects]);

  useEffect(() => {
    if (!viewerReady || !selectedSiteId) return;

    let cancelled = false;

    const fly = async () => {
      let center = centersRef.current.get(selectedSiteId);
      if (!center) {
        const project = projects.find((p) => p.id === selectedSiteId);
        if (!project) return;
        center = (await resolveProjectCenter(project)) ?? undefined;
        if (!center || cancelled) return;
        centersRef.current.set(selectedSiteId, center);
        setMarkerCenters((prev) => ({ ...prev, [selectedSiteId]: center! }));
      }

      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer || viewer.isDestroyed() || cancelled) return;

      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(center.lng, center.lat, 15000),
        duration: 2.0,
      });
    };

    void fly();

    return () => {
      cancelled = true;
    };
  }, [viewerReady, selectedSiteId, projects]);

  return (
    <div className="absolute inset-0 orblode-globe">
      <Viewer
        ref={handleViewerRef}
        full
        timeline={false}
        animation={false}
        geocoder={false}
        baseLayerPicker={false}
        navigationHelpButton={false}
        homeButton={false}
        sceneModePicker={false}
        fullscreenButton={false}
        infoBox={false}
        selectionIndicator={false}
        style={{ width: "100%", height: "100%" }}
      >
        {Object.entries(markerCenters).map(([id, center]) => {
          const project = projects.find((p) => p.id === id);
          if (!project) return null;
          return (
            <Entity key={id} position={Cartesian3.fromDegrees(center.lng, center.lat)} name={project.name}>
              <PointGraphics
                pixelSize={SITE_MARKER.pixelSize}
                color={MARKER_FILL}
                outlineColor={MARKER_OUTLINE}
                outlineWidth={SITE_MARKER.outlineWidth}
              />
            </Entity>
          );
        })}
        {insta.overlays.map((o) => (
          <InstaViewLayer key={o.id} overlay={o} focus={insta.focus} onLoaded={insta.loaded} onFailed={insta.failed} />
        ))}
      </Viewer>
    </div>
  );
}
