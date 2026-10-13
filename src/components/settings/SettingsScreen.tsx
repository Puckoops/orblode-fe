"use client";

import { Briefcase01Icon, Building03Icon, Notification03Icon, UserCircleIcon, UserGroupIcon, UserMultiple02Icon } from "@hugeicons/core-free-icons";
import { Band, Icon, Page, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, type IconDefinition } from "@puckoops/camelot";
import { useSearchParams } from "next/navigation";
import { GeneralSettings } from "./GeneralSettings";
import { NotificationSettings } from "./NotificationSettings";
import { OrganisationSettings } from "./OrganisationSettings";
import { PeopleSettings } from "./PeopleSettings";
import styles from "./settings.module.css";
import { TeamsSettings } from "./TeamsSettings";
import { WorkspaceSettings } from "./WorkspaceSettings";

const TABS = [
  { value: "general", label: "General", icon: UserCircleIcon },
  { value: "notifications", label: "Notifications", icon: Notification03Icon },
  { value: "workspace", label: "Workspace", icon: Briefcase01Icon },
  { value: "people", label: "People", icon: UserMultiple02Icon },
  { value: "teams", label: "Teams", icon: UserGroupIcon },
  { value: "organisation", label: "Organisation", icon: Building03Icon },
] as const satisfies readonly { value: string; label: string; icon: IconDefinition }[];
type Tab = (typeof TABS)[number]["value"];

/** Settings, with its sections in a side panel: General (the account, appearance, sign-out), Notifications, the
 * open Workspace, and the organisation's People, Teams and privileges. */
export function SettingsScreen() {
  const params = useSearchParams();
  const asked = params.get("tab");
  const requested = asked === "workspaces" ? "workspace" : asked;
  const tab: Tab = TABS.find((t) => t.value === requested)?.value ?? "general";
  const teamId = tab === "teams" ? params.get("team") : null;

  // Next keeps useSearchParams in step with replaceState, so the URL is the only record of the tab and
  // a link to another tab works from here too.
  const choose = (next: Tab) => window.history.replaceState(null, "", next === "general" ? "/settings" : `/settings?tab=${next}`);
  const openTeam = (id: string | null) =>
    window.history.replaceState(null, "", id ? `/settings?tab=teams&team=${encodeURIComponent(id)}` : "/settings?tab=teams");

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Your account, your notifications, your workspace, your organisation's people and teams, and how Orblode looks on this device." />
      <Tabs value={tab} onValueChange={(v) => choose(v as Tab)} orientation="vertical" className={styles.tabs}>
        <TabsList aria-label="Settings" className={styles.nav}>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className={styles.item}>
              <span className="inline-flex items-center gap-[10px]">
                <Icon icon={t.icon} size={18} className={styles.itemIcon} />
                {t.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general" className={styles.panel}>
          <GeneralSettings />
        </TabsContent>

        <TabsContent value="notifications" className={styles.panel}>
          <Band first heading="Notifications" caption="Where each kind of notice reaches you. The same in every organisation you belong to.">
            <NotificationSettings />
          </Band>
        </TabsContent>

        <TabsContent value="workspace" className={styles.panel}>
          <WorkspaceSettings />
        </TabsContent>

        <TabsContent value="people" className={styles.panel}>
          <PeopleSettings />
        </TabsContent>

        <TabsContent value="teams" className={styles.panel}>
          <TeamsSettings teamId={teamId} onOpen={openTeam} />
        </TabsContent>

        <TabsContent value="organisation" className={styles.panel}>
          <OrganisationSettings />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
