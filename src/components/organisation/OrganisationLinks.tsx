"use client";

import { TextLink, toast } from "@puckoops/camelot";
import { useEffect } from "react";
import { useAuthClient } from "@/hooks/useAuth";
import { switchOrganisation } from "@/lib/auth";
import { organisationLabel, orgLink, unopened, withoutOrg } from "@/lib/organisation/links";
import { markPointedOut, pointedOut } from "@/lib/organisation/pointedOut";
import { useOrganisation } from "@/lib/organisation/store";

async function switchTo(clientId: string, to?: string) {
  const failed = await switchOrganisation(clientId, to);
  toast.error("Couldn’t open that organisation", failed);
}

/**
 * Opens the organisation a link names (`?org=`, as the "you were added" email's does), and points
 * out, once per browser, each organisation the person was added to but hasn't opened. Renders nothing.
 */
export function OrganisationLinks() {
  const clientId = useAuthClient()?.id;
  const loadMine = useOrganisation((s) => s.loadMine);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    void loadMine().then((mine) => {
      if (cancelled || !mine) return;
      const here = withoutOrg(window.location.href);
      const link = orgLink(new URLSearchParams(window.location.search).get("org"), mine);
      if (link.kind === "switch") {
        void switchTo(link.id, here);
        return;
      }
      if (link.kind !== "none") window.history.replaceState(window.history.state, "", here);
      if (link.kind === "unknown") toast.error("You’re not in that organisation", "Ask whoever sent the link to add you, then open it again.");

      const seen = pointedOut();
      const fresh = unopened(mine, seen);
      for (const o of fresh) {
        toast(`You’ve been added to ${organisationLabel(o)}`, {
          description: (
            <TextLink as="button" type="button" onClick={() => void switchTo(o.id)}>
              Switch to it
            </TextLink>
          ),
        });
      }
      markPointedOut(fresh.map((o) => o.id));
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, loadMine]);

  return null;
}
