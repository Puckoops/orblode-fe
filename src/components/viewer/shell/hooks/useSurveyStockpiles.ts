"use client";

import { useEffect, useState } from "react";

import { listMeasurements, type Measurement } from "@/lib/api/orblodeSvc";
import { isSavedStockpile } from "@/lib/viewer/compare";

export type SurveyStockpiles = Measurement[] | "loading" | "failed";

/** A survey's saved stockpiles; a null survey stays "loading" and fetches nothing. */
export function useSurveyStockpiles(surveyId: string | null): SurveyStockpiles {
  const [piles, setPiles] = useState<SurveyStockpiles>("loading");

  const [loadedFor, setLoadedFor] = useState(surveyId);
  if (loadedFor !== surveyId) {
    setLoadedFor(surveyId);
    setPiles("loading");
  }

  useEffect(() => {
    if (!surveyId) return;
    let cancelled = false;
    listMeasurements(surveyId)
      .then((res) => {
        if (!cancelled) setPiles(res.measurements.filter(isSavedStockpile));
      })
      .catch(() => {
        if (!cancelled) setPiles("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId]);

  return piles;
}
