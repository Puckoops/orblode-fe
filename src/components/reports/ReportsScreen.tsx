"use client";

import { Page, PageHeader, SearchSelect, SegmentedControl, Tabs, TabsContent, TabsList, TabsTrigger } from "@puckoops/camelot";
import { useCallback, useEffect, useState } from "react";
import { ReplenishmentReports, SummaryCsvButton } from "@/components/mm/ReplenishmentReports";
import { useMinorMinerals } from "@/hooks/useMinorMinerals";
import { useSiteInWorkspace } from "@/hooks/useSiteInWorkspace";
import { listMaterials, listSurveys, type Material, type Survey } from "@/lib/api/orblodeSvc";
import { useMMMode } from "@/lib/workspaces/access";
import { useWorkspaceSites } from "@/lib/workspaces/store";
import { InventoryTab } from "./InventoryTab";
import { MaterialsTab } from "./MaterialsTab";
import { ReconciliationTab } from "./ReconciliationTab";
import { TrendsTab } from "./TrendsTab";

const TABS = ["inventory", "reconciliation", "trends", "materials"] as const;
type Tab = (typeof TABS)[number];

/** Stockpile reports by site; a minor-minerals workspace leads with its replenishment reports, and an official sees
 * only those. */
export function ReportsScreen() {
  const projects = useWorkspaceSites();
  const minorMinerals = useMinorMinerals();
  const official = useMMMode() === "official";
  const [kind, setKind] = useState<"replenishment" | "stockpiles">("replenishment");
  const [siteId, setSiteId] = useState("");
  const [linkedSite, setLinkedSite] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("inventory");
  const [surveys, setSurveys] = useState<Survey[] | null>(null);
  const [materials, setMaterials] = useState<Material[] | null>(null);

  const [loadedSite, setLoadedSite] = useState(siteId);
  if (loadedSite !== siteId) {
    setLoadedSite(siteId);
    setSurveys(null);
    setMaterials(null);
  }

  // ?site= and ?tab= are read from window.location so the page needs no Suspense boundary.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const site = params.get("site");
    const t = params.get("tab");
    if (site) {
      setSiteId(site);
      setLinkedSite(site);
    }
    if (t && (TABS as readonly string[]).includes(t)) setTab(t as Tab);
    if (site || t) setKind("stockpiles");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useSiteInWorkspace(siteId, setSiteId, linkedSite, true);

  useEffect(() => {
    if (!siteId) return;
    window.history.replaceState(null, "", `/reports?site=${encodeURIComponent(siteId)}&tab=${tab}`);
  }, [siteId, tab]);

  const loadMaterials = useCallback(() => {
    if (!siteId) return;
    listMaterials(siteId)
      .then(setMaterials)
      .catch((err) => {
        console.error("Failed to fetch materials:", err);
        setMaterials([]);
      });
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    listSurveys(siteId)
      .then((res) => {
        if (!cancelled) setSurveys((res.surveys || []).slice().sort((a, b) => b.survey_date.localeCompare(a.survey_date)));
      })
      .catch((err) => {
        console.error("Failed to fetch surveys:", err);
        if (!cancelled) setSurveys([]);
      });
    loadMaterials();
    return () => {
      cancelled = true;
    };
  }, [siteId, loadMaterials]);

  const site = projects.find((p) => p.id === siteId);
  const kindSwitch = minorMinerals && !official && (
    <SegmentedControl
      aria-label="Kind of report"
      value={kind}
      onValueChange={(v) => setKind(v as typeof kind)}
      options={[
        { value: "replenishment", label: "Replenishment" },
        { value: "stockpiles", label: "Stockpiles" },
      ]}
    />
  );

  if (minorMinerals && (official || kind === "replenishment"))
    return (
      <Page>
        <PageHeader
          title="Reports"
          subtitle="Replenishment reports: drafted from a study, vetted along the review chain, shared by link."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {kindSwitch}
              <SummaryCsvButton />
            </div>
          }
        />
        <ReplenishmentReports />
      </Page>
    );

  return (
    <Page>
      <PageHeader
        title="Reports"
        subtitle={site ? `Stockpile inventory, reconciliation and trends for ${site.name}` : "Stockpile inventory, reconciliation and trends"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {kindSwitch}
            <SearchSelect
              className="w-64"
              aria-label="Site"
              value={siteId || null}
              onValueChange={setSiteId}
              placeholder="Select a site…"
              searchPlaceholder="Find a site"
              options={projects.map((p) => ({ value: p.id, label: p.name, meta: p.location_name ?? undefined }))}
              empty={(query) => (query ? `No site matches “${query}”.` : "No sites yet.")}
            />
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="materials" count={materials?.length}>
            Materials
          </TabsTrigger>
        </TabsList>

        {siteId && (
          <>
            <TabsContent value="inventory" className="pt-6">
              <InventoryTab key={siteId} surveys={surveys} />
            </TabsContent>
            <TabsContent value="reconciliation" className="pt-6">
              <ReconciliationTab key={siteId} projectId={siteId} surveys={surveys} materials={materials} />
            </TabsContent>
            <TabsContent value="trends" className="pt-6">
              <TrendsTab key={siteId} projectId={siteId} />
            </TabsContent>
            <TabsContent value="materials" className="pt-6">
              <MaterialsTab key={siteId} projectId={siteId} materials={materials} onChanged={loadMaterials} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </Page>
  );
}
