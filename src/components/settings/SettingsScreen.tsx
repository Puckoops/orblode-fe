"use client";

import { Logout03Icon } from "@hugeicons/core-free-icons";
import { Band, Button, Card, DescriptionList, Page, PageHeader, SegmentedControl, useTheme, type ThemePreference } from "@puckoops/camelot";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { APPEARANCE } from "@/components/shell/UserMenu";
import { useAuthClient, useAuthUser } from "@/hooks/useAuth";
import { signOut } from "@/lib/auth";

/** The signed-in identity from the login response, appearance, and sign-out. */
export function SettingsScreen() {
  const router = useRouter();
  const user = useAuthUser();
  const client = useAuthClient();
  const { preference, setPreference } = useTheme();
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    setLeaving(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Your account and how Orblode looks on this device." />
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
    </Page>
  );
}
