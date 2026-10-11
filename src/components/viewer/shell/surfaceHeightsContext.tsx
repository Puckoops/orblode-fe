"use client";

import { createContext, useContext } from "react";

import type { SurfaceHeights } from "@/lib/viewer/surfaceHeights";

const SurfaceHeightsContext = createContext<SurfaceHeights | null>(null);

export const SurfaceHeightsProvider = SurfaceHeightsContext.Provider;

export function useSurfaceHeights(): SurfaceHeights {
  const ctx = useContext(SurfaceHeightsContext);
  if (!ctx) {
    throw new Error("useSurfaceHeights must be used within a SurfaceHeightsProvider");
  }
  return ctx;
}
