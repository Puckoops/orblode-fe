"use client";

import { DroneIcon, MapsLocation01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { ActionCard, Page, PageHeader } from "@puckoops/camelot";
import { useEffect, useState } from "react";
import { Loader } from "@/components/brand/Loader";
import { NewLeaseSite } from "@/components/mm/NewLeaseSite";
import { PlanMission } from "@/components/mm/PlanMission";
import { useMinorMinerals } from "@/hooks/useMinorMinerals";
import { useMMMode } from "@/lib/workspaces/access";
import { UploadScreen } from "./UploadScreen";

type Start = "lease" | "mission" | "survey";

interface Asked {
  start: Start | null;
  site: string | null;
  lease: string | null;
}

/** ?create= picks the start; ?site= or ?new= alone is an upload, as everywhere else. */
function askedNow(): Asked {
  const p = new URLSearchParams(window.location.search);
  const create = p.get("create");
  const start = create === "lease" || create === "mission" || create === "survey" ? create : p.get("site") || p.get("new") ? "survey" : null;
  return { start, site: p.get("site"), lease: p.get("lease") };
}

/** Create: survey data and designs, and in a minor-minerals workspace also a new lease site or a mission plan. */
export function CreateScreen() {
  const minorMinerals = useMinorMinerals();
  const mode = useMMMode();
  const [asked, setAsked] = useState<Asked | null>(null);

  // Read from window.location so the page needs no Suspense boundary; Back between the starts reads it again.
  useEffect(() => {
    const read = () => setAsked(askedNow());
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const choose = (start: Start | null) => {
    window.history.pushState(null, "", start ? `/upload?create=${start}` : "/upload");
    setAsked({ start, site: null, lease: null });
  };

  if (mode === null || asked === null) return <Loader label="Loading" />;
  if (!minorMinerals || asked.start === "survey") return <UploadScreen />;
  if (asked.start === "lease") return <NewLeaseSite key={asked.site ?? "new"} siteId={asked.site} onBack={() => choose(null)} />;
  if (asked.start === "mission") return <PlanMission leaseId={asked.lease} onBack={() => choose(null)} />;
  return (
    <Page>
      <PageHeader title="Create" subtitle="Start a lease site, plan a drone mission, or add survey data to a site" />
      <div className="grid gap-4 sm:grid-cols-3">
        <ActionCard
          icon={MapsLocation01Icon}
          title="New lease site"
          caption="Drop the lease boundary: it places the site and starts the application."
          onClick={() => choose("lease")}
        />
        <ActionCard icon={DroneIcon} title="Plan a mission" caption="Lay out a pre- or post-monsoon flight over a lease." onClick={() => choose("mission")} />
        <ActionCard
          icon={Upload01Icon}
          title="Upload survey data"
          caption="Add a flight’s outputs to a site; outside the monsoon its season follows its date."
          onClick={() => choose("survey")}
        />
      </div>
    </Page>
  );
}
