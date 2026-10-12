"use client";

import { Alert, Button, Checkbox, Skeleton, Table, TBody, Td, TGroup, Th, THead, Tr, type AlertTone } from "@puckoops/camelot";
import { Fragment, useEffect, useState } from "react";
import { useAuthUser } from "@/hooks/useAuth";
import { getNotificationPreferences, saveNotificationPreferences, type NotificationTypePreference } from "@/lib/api/notifications";
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

/**
 * Where each kind of notice reaches you: in Orblode (the inbox and a toast) and in the browser
 * (push). Activity can be kept out of Orblode; a notice someone is waiting on always shows there.
 */
export function NotificationSettings() {
  const userId = useAuthUser()?.id;
  const [types, setTypes] = useState<NotificationTypePreference[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    getNotificationPreferences().then(setTypes, () => setFailed(true));
  }, []);

  useEffect(() => {
    if (userId) pushState(userId).then(setPush, () => setPush("unavailable"));
  }, [userId]);

  const save = async (next: NotificationTypePreference[]) => {
    if (!types) return;
    const before = types;
    setTypes(next);
    setSaving(true);
    try {
      setTypes(
        await saveNotificationPreferences(
          next.filter((t) => t.muted).map((t) => t.type),
          next.filter((t) => t.push_muted).map((t) => t.type)
        )
      );
    } catch {
      setTypes(before);
      toast.error("Couldn't save your notification settings. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const change = (type: string, patch: Partial<NotificationTypePreference>) => {
    if (types) void save(types.map((t) => (t.type === type ? { ...t, ...patch } : t)));
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
  if (!types) return <Skeleton height={320} />;

  const browser = push !== null && push !== "unavailable" ? push : null;

  return (
    <div className="flex flex-col gap-6">
      {browser && <BrowserPush state={browser} busy={switching} onSwitch={(on) => void switchPush(on)} />}
      <Table
        minWidth={300}
        footer={
          browser
            ? "Notices someone is waiting on always show in Orblode. The Browser column applies in every browser you turn notifications on in."
            : "Notices someone is waiting on always show in Orblode."
        }
      >
        <THead>
          <Tr>
            <Th>Notification</Th>
            <Th className="w-20 text-center sm:w-32">In Orblode</Th>
            {browser && <Th className="w-20 text-center sm:w-32">Browser</Th>}
          </Tr>
        </THead>
        <TBody>
          {groupTypes(types).map((group) => (
            <Fragment key={group.label}>
              <TGroup colSpan={browser ? 3 : 2}>{group.label}</TGroup>
              {group.types.map((t) => (
                <Tr key={t.type}>
                  <Td primary>{t.label}</Td>
                  <Td>
                    <Cell
                      id={`notify-${t.type}-orblode`}
                      label={`${t.label}, in Orblode`}
                      checked={!t.muted}
                      disabled={!t.mutable || saving}
                      onChange={(on) => change(t.type, { muted: !on })}
                    />
                  </Td>
                  {browser && (
                    <Td className="text-center">
                      {t.pushable ? (
                        <Cell
                          id={`notify-${t.type}-browser`}
                          label={`${t.label}, in the browser`}
                          checked={!t.push_muted}
                          disabled={saving}
                          onChange={(on) => change(t.type, { push_muted: !on })}
                        />
                      ) : (
                        <span className="text-ink-4" title="Only notices someone is waiting on reach the browser">
                          —
                        </span>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </Fragment>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
