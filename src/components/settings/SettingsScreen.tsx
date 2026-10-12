"use client";

import { Notification03Icon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { Band, Icon, Page, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, type IconDefinition } from "@puckoops/camelot";
import { useSearchParams } from "next/navigation";
import { GeneralSettings } from "./GeneralSettings";
import { NotificationSettings } from "./NotificationSettings";
import styles from "./settings.module.css";

const TABS = [
  { value: "general", label: "General", icon: UserCircleIcon },
  { value: "notifications", label: "Notifications", icon: Notification03Icon },
] as const satisfies readonly { value: string; label: string; icon: IconDefinition }[];
type Tab = (typeof TABS)[number]["value"];

/** Settings, with its sections in a side panel: General (the account, appearance, sign-out) and Notifications. */
export function SettingsScreen() {
  const requested = useSearchParams().get("tab");
  const tab: Tab = TABS.find((t) => t.value === requested)?.value ?? "general";

  // Next keeps useSearchParams in step with replaceState, so the URL is the only record of the tab and
  // a link to another tab works from here too.
  const choose = (next: Tab) => window.history.replaceState(null, "", next === "general" ? "/settings" : `/settings?tab=${next}`);

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Your account, your notifications and how Orblode looks on this device." />
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
      </Tabs>
    </Page>
  );
}
