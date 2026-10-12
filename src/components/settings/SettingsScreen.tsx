"use client";

import { Logout03Icon } from "@hugeicons/core-free-icons";
import {
  Band,
  Button,
  Card,
  DescriptionList,
  Page,
  PageHeader,
  SegmentedControl,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useTheme,
  type ThemePreference,
} from "@puckoops/camelot";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { APPEARANCE } from "@/components/shell/UserMenu";
import { useAuthClient, useAuthUser } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";
import { releasePush } from "@/lib/push/client";
import { NotificationSettings } from "./NotificationSettings";

const TABS = ["general", "notifications"] as const;
type Tab = (typeof TABS)[number];

/** Settings in two tabs: General (who is signed in, appearance, sign-out) and Notifications. */
export function SettingsScreen() {
  const router = useRouter();
  const user = useAuthUser();
  const client = useAuthClient();
  const { preference, setPreference } = useTheme();
  const [leaving, setLeaving] = useState(false);
  const requested = useSearchParams().get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(requested ?? "") ? (requested as Tab) : "general";

  // Next keeps useSearchParams in step with replaceState, so the URL is the only record of the tab and
  // a link to another tab works from here too.
  const choose = (next: Tab) => window.history.replaceState(null, "", next === "general" ? "/settings" : `/settings?tab=${next}`);

  const leave = async () => {
    setLeaving(true);
    await releasePush().catch(() => undefined);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Your account, your notifications and how Orblode looks on this device." />
      <Tabs value={tab} onValueChange={(v) => choose(v as Tab)}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="pt-6">
          <Band first heading="Account">
            <Card>
              <DescriptionList
                items={[
                  { label: "Name", value: user?.name || "—" },
                  { label: "Email", value: user?.email || "—" },
                  { label: "Company", value: client?.company_name || client?.name || "—" },
                ]}
              />
            </Card>
          </Band>
          <Band heading="Appearance" caption="Applies to this browser.">
            <SegmentedControl<ThemePreference> aria-label="Appearance" value={preference} onValueChange={setPreference} options={APPEARANCE} />
          </Band>
          <Band heading="Session">
            <Button iconStart={Logout03Icon} onClick={leave} loading={leaving}>
              Sign out
            </Button>
          </Band>
        </TabsContent>

        <TabsContent value="notifications" className="pt-6">
          <Band first heading="Notifications" caption="Where each kind of notice reaches you. The same in every organisation you belong to.">
            <NotificationSettings />
          </Band>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
