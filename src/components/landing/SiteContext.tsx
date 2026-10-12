"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SiteInfo } from "@/lib/landing/site";

const Site = createContext<SiteInfo | null>(null);

export function SiteProvider({ site, children }: { site: SiteInfo; children: ReactNode }) {
  return <Site.Provider value={site}>{children}</Site.Provider>;
}

export function useSite(): SiteInfo {
  const site = useContext(Site);
  if (!site) throw new Error("useSite needs a SiteProvider");
  return site;
}
