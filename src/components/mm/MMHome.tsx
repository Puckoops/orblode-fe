"use client";

import { Page, Skeleton } from "@puckoops/camelot";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MODE_HOME } from "@/lib/mm/roleHome";
import { useMMMode } from "@/lib/workspaces/access";

/** Minor minerals has no screen of its own: planners work from Sites, officials from Reports and vendors from Missions. */
export function MMHome() {
  const router = useRouter();
  const mode = useMMMode();
  useEffect(() => {
    if (mode) router.replace(MODE_HOME[mode]);
  }, [mode, router]);

  return (
    <Page>
      <Skeleton height={320} />
    </Page>
  );
}
