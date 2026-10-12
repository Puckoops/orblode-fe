"use client";

import { useEffect, useRef } from "react";
import { getProject } from "@/lib/api/userSvc";
import { useWorkspaces } from "@/lib/workspaces/store";

/**
 * Keeps a screen's chosen site inside the current workspace. The site a link asked for (`linked`),
 * when it lives in another workspace the person sees, switches to that workspace, once. Any other
 * site outside the workspace gives way to the first site (`pickFirst`) or to none.
 */
export function useSiteInWorkspace(siteId: string, setSiteId: (id: string) => void, linked: string | null, pickFirst: boolean) {
  const sites = useWorkspaces((s) => s.sites);
  const follow = useWorkspaces((s) => s.follow);
  const tried = useRef<string | null>(null);

  useEffect(() => {
    if (!sites) return;
    if (siteId && sites.some((p) => p.id === siteId)) return;
    const fallback = pickFirst ? (sites[0]?.id ?? "") : "";

    if (siteId && siteId === linked && tried.current !== siteId) {
      tried.current = siteId;
      let cancelled = false;
      getProject(siteId)
        .then((site) => {
          if (!cancelled && !follow(site)) setSiteId(fallback);
        })
        .catch(() => {
          if (!cancelled) setSiteId(fallback);
        });
      return () => {
        cancelled = true;
      };
    }
    if (siteId !== fallback) setSiteId(fallback);
  }, [sites, siteId, linked, pickFirst, follow, setSiteId]);
}
