import { toast } from "@puckoops/camelot";
import { switchOrganisation } from "@/lib/auth";
import { orgLink, withoutOrg } from "@/lib/organisation/links";
import { useOrganisation } from "@/lib/organisation/store";

/**
 * Goes where a notice points. A link naming another of the person's organisations (`?org=`, as
 * "added you to" has) switches the session to it first, which loads the page afresh.
 */
export async function followNoticeLink(link: string, push: (href: string) => void): Promise<void> {
  const org = new URL(link, "http://localhost").searchParams.get("org");
  if (!org) {
    push(link);
    return;
  }
  const target = orgLink(org, (await useOrganisation.getState().loadMine()) ?? []);
  if (target.kind === "switch") {
    toast.error("Couldn’t open that organisation", await switchOrganisation(target.id, withoutOrg(link)));
    return;
  }
  if (target.kind === "unknown") {
    toast.error("You’re not in that organisation any more", "Ask an owner or admin there to add you again.");
    return;
  }
  push(withoutOrg(link));
}
