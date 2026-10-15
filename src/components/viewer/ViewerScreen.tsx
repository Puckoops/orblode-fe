"use client";

import dynamic from "next/dynamic";
import { Loader } from "@/components/brand/Loader";
import { SurveyProcessingGate } from "@/components/viewer/SurveyProcessingGate";
import { useCesiumReady } from "@/hooks/useCesiumReady";

const ViewerPlaceholder = () => <Loader variant="fill" label="Loading the viewer" />;

// The shell's chunk resolves the `cesium` external at eval time, so it must not load before window.Cesium exists.
const ViewerShell = dynamic(() => import("@/components/viewer/shell/ViewerShell").then((mod) => mod.ViewerShell), {
  ssr: false,
  loading: ViewerPlaceholder,
});

export function ViewerScreen({ surveyId }: { surveyId: string }) {
  const cesiumReady = useCesiumReady();
  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas" aria-busy={!cesiumReady}>
      <SurveyProcessingGate key={surveyId} surveyId={surveyId}>
        {cesiumReady ? <ViewerShell surveyId={surveyId} /> : <ViewerPlaceholder />}
      </SurveyProcessingGate>
    </div>
  );
}
