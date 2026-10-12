"use client";

import { Alert, Button, Checkbox, Skeleton, Table, TBody, Td, TGroup, Th, THead, Tr, type AlertTone } from "@puckoops/camelot";
import { Fragment, useEffect, useState } from "react";
import { useAuthUser } from "@/hooks/useAuth";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationChannel,
  type NotificationPreferences,
} from "@/lib/api/notifications";
import { groupTypes } from "@/lib/notifications/groups";
import { pushState, turnOffPush, turnOnPush, type PushState } from "@/lib/push/client";
import { toast } from "@/lib/toast";

function Cell({ id, label, checked, disabled, onChange }: { id: string; label: string; checked: boolean; disabled: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex justify-center">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
    </div>
  );
}

const PUSH_STATE: Record<Exclude<PushState, "unavailable">, { tone: AlertTone; title: string; body?: string }> = {
  on: { tone: "success", title: "Browser notifications are on in this browser" },
  off: {
    tone: "info",
    title: "Browser notifications are off in this browser",
    body: "Turn them on to hear about what someone is waiting on with Orblode closed.",
  },
  blocked: { tone: "warning", title: "This browser blocks Orblode's notifications", body: "Allow them in the browser's site settings, then reload this page." },
  unsupported: { tone: "neutral", title: "This browser can't show notifications from Orblode" },
};

/** This browser's push, on or off; the grid's Browser column is the person's own, in every browser. */
function BrowserPush({ state, busy, onSwitch }: { state: Exclude<PushState, "unavailable">; busy: boolean; onSwitch: (on: boolean) => void }) {
  const { tone, title, body } = PUSH_STATE[state];
  const action =
    state === "on" || state === "off" ? (
      <Button variant="ghost" loading={busy} onClick={() => onSwitch(state === "off")}>
        {state === "off" ? "Turn on" : "Turn off"}
      </Button>
    ) : undefined;
  return (
    <Alert tone={tone} title={title} action={action}>
      {body}
    </Alert>
  );
}

const COLUMNS: { channel: NotificationChannel; heading: string; short: string; where: string }[] = [
  { channel: "in_app", heading: "In Orblode", short: "Orblode", where: "in Orblode" },
  { channel: "push", heading: "Browser", short: "Browser", where: "in the browser" },
  { channel: "email", heading: "Email", short: "Email", where: "by email" },
];

// Three channel columns fit a phone only with tighter cells and shorter headings.
const CHANNEL_CELL = "max-sm:px-1.5 max-sm:last:pr-4";

/**
 * Where each kind of notice reaches you: in Orblode (the inbox and a toast), in the browser (push)
 * and by email. A notice someone is waiting on always shows in Orblode.
 */
export function NotificationSettings() {
  const userId = useAuthUser()?.id;
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    getNotificationPreferences().then(setPrefs, () => setFailed(true));
  }, []);

  useEffect(() => {
    if (userId) pushState(userId).then(setPush, () => setPush("unavailable"));
  }, [userId]);

  const choose = async (type: string, channel: NotificationChannel, on: boolean) => {
    if (!prefs) return;
    const before = prefs;
    setPrefs({
      ...prefs,
      types: prefs.types.map((t) => (t.type === type ? { ...t, channels: { ...t.channels, [channel]: { ...t.channels[channel], on } } } : t)),
    });
    setSaving(true);
    try {
      setPrefs(await saveNotificationPreferences({ [type]: { [channel]: on } }));
    } catch {
      setPrefs(before);
      toast.error("Couldn't save your notification settings. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const switchPush = async (on: boolean) => {
    if (!userId) return;
    setSwitching(true);
    try {
      if (on) {
        const state = await turnOnPush(userId);
        setPush(state);
        if (state === "blocked") toast.error("The browser blocked notifications from Orblode.");
      } else {
        await turnOffPush();
        setPush("off");
      }
    } catch {
      toast.error(on ? "Couldn't turn on browser notifications. Try again." : "Couldn't turn off browser notifications. Try again.");
    } finally {
      setSwitching(false);
    }
  };

  if (failed) return <p className="small">Notification settings couldn&apos;t be loaded. Reload to try again.</p>;
  if (!prefs) return <Skeleton height={320} />;

  const browser = push !== null && push !== "unavailable" ? push : null;
  const unavailable: Partial<Record<NotificationChannel, boolean>> = { push: push === "unavailable", email: !prefs.email };
  const notes = [
    "Notices someone is waiting on always show in Orblode.",
    browser && "Browser applies in every browser you turn notifications on in.",
    unavailable.push && "Browser notifications aren't set up for Orblode yet.",
    unavailable.email && "Email isn't set up for Orblode yet; your choices are kept for when it is.",
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      {browser && <BrowserPush state={browser} busy={switching} onSwitch={(on) => void switchPush(on)} />}
      <Table minWidth={300} footer={notes.join(" ")}>
        <THead>
          <Tr>
            <Th>Notification</Th>
            {COLUMNS.map((c) => (
              <Th key={c.channel} className={`text-center sm:w-28 ${CHANNEL_CELL}`}>
                <span className="sm:hidden">{c.short}</span>
                <span className="max-sm:hidden">{c.heading}</span>
              </Th>
            ))}
          </Tr>
        </THead>
        <TBody>
          {groupTypes(prefs.types).map((group) => (
            <Fragment key={group.label}>
              <TGroup colSpan={COLUMNS.length + 1}>{group.label}</TGroup>
              {group.types.map((t) => (
                <Tr key={t.type}>
                  <Td primary>{t.label}</Td>
                  {COLUMNS.map(({ channel, where }) => {
                    const state = t.channels[channel];
                    return (
                      <Td key={channel} className={CHANNEL_CELL}>
                        <Cell
                          id={`notify-${t.type}-${channel}`}
                          label={`${t.label}, ${where}`}
                          checked={state.on}
                          disabled={saving || !!state.locked || !!unavailable[channel]}
                          onChange={(on) => void choose(t.type, channel, on)}
                        />
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </Fragment>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
