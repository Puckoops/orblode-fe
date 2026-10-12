"use client";

import { Card, Divider, Skeleton, Stack, Switch } from "@puckoops/camelot";
import { useEffect, useState } from "react";
import { useAuthUser } from "@/hooks/useAuth";
import { getNotificationPreferences, saveNotificationPreferences, type NotificationTypePreference } from "@/lib/api/notifications";
import { pushState, turnOffPush, turnOnPush, type PushState } from "@/lib/push/client";
import { toast } from "@/lib/toast";

function pushNote(state: PushState): string {
  if (state === "blocked") return "This browser blocks Orblode's notifications. Allow them in the browser's site settings, then come back.";
  if (state === "unsupported") return "This browser can't show notifications from Orblode.";
  return "Notices someone is waiting on reach this browser when no Orblode tab is in view.";
}

/**
 * One switch per kind of notice: activity can be turned off, a notice you have to act on always
 * arrives. Below, browser notifications for this browser and which of those notices they carry.
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
  if (!types) return <Skeleton height={160} />;

  const pushable = types.filter((t) => t.pushable);

  return (
    <Card>
      <Stack gap={4}>
        {types.map((t) => (
          <Switch
            key={t.type}
            label={t.label}
            description={t.mutable ? undefined : "Always on: someone is waiting on this."}
            labelPosition="start"
            checked={!t.muted}
            disabled={!t.mutable || saving}
            onCheckedChange={(on) => void save(types.map((x) => (x.type === t.type ? { ...x, muted: !on } : x)))}
          />
        ))}
        {push && push !== "unavailable" && (
          <>
            <Divider />
            <Switch
              label="Browser notifications in this browser"
              description={pushNote(push)}
              labelPosition="start"
              checked={push === "on"}
              disabled={push === "blocked" || push === "unsupported" || switching}
              onCheckedChange={(on) => void switchPush(on)}
            />
            {push === "on" &&
              pushable.map((t) => (
                <Switch
                  key={t.type}
                  label={t.label}
                  labelPosition="start"
                  checked={!t.push_muted}
                  disabled={saving}
                  onCheckedChange={(on) => void save(types.map((x) => (x.type === t.type ? { ...x, push_muted: !on } : x)))}
                />
              ))}
          </>
        )}
      </Stack>
    </Card>
  );
}
