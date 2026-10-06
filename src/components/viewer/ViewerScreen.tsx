"use client";

import { Skeleton } from "@puckoops/camelot";
import dynamic from "next/dynamic";
import { useCesiumReady } from "@/hooks/useCesiumReady";

const ViewerPlaceholder = () => <Skeleton width="100%" height="100%" radius="0" />;

// The shell's chunk resolves the `cesium` external at eval time, so it must not load before window.Cesium exists.
const ViewerShell = dynamic(() => import("@/components/viewer/shell/ViewerShell").then((mod) => mod.ViewerShell), {
  ssr: false,
  loading: ViewerPlaceholder,
});

export function ViewerScreen({ surveyId }: { surveyId: string }) {
  const cesiumReady = useCesiumReady();
  return (
    <div className="h-full w-full overflow-hidden bg-canvas" aria-busy={!cesiumReady}>
      {cesiumReady ? <ViewerShell surveyId={surveyId} /> : <ViewerPlaceholder />}
    </div>
  );
}
