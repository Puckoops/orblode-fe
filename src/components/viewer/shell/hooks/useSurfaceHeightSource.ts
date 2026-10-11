"use client";

import { useEffect } from "react";
import type { RefObject } from "react";
import { CesiumTerrainProvider, type TerrainProvider, type Viewer as CesiumViewer } from "cesium";

import type { Manifest } from "@/lib/api/orblodeSvc";
import type { ViewMode } from "@/lib/viewer/cameraControls";
import { useViewerStore } from "@/lib/viewer/state/store";
import type { SurfaceHeights } from "@/lib/viewer/surfaceHeights";

/** The survey's own surface: its DSM, else any terrain it shipped. */
function surveySurfaceUrl(manifest: Manifest | null): string | null {
  const terrain = (manifest?.layers.terrain || []).filter((t) => !!t.tile_directory_url);
  const dsm = terrain.find((t) => (t.surface_type || "").toLowerCase() === "dsm");
  return (dsm ?? terrain[0])?.tile_directory_url ?? null;
}

/** Points SurfaceHeights at the survey surface while the site is drawn flat (2D), and switches it off in 3D. */
export function useSurfaceHeightSource(
  heights: SurfaceHeights,
  viewerRef: RefObject<CesiumViewer | null>,
  viewerReady: boolean,
  viewMode: ViewMode
): void {
  const surfaceUrl = useViewerStore((s) => surveySurfaceUrl(s.manifest));

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewMode !== "2d" || !viewerReady || !viewer || viewer.isDestroyed()) return;
    let alive = true;
    const shown = (): TerrainProvider | null => (viewer.terrainProvider.availability ? viewer.terrainProvider : null);
    if (surfaceUrl) {
      CesiumTerrainProvider.fromUrl(surfaceUrl).then(
        (provider) => alive && heights.setSource(provider),
        () => alive && heights.setSource(shown())
      );
    } else {
      heights.setSource(shown());
    }
    return () => {
      alive = false;
      heights.setSource(null);
    };
  }, [heights, viewerRef, viewerReady, viewMode, surfaceUrl]);
}
