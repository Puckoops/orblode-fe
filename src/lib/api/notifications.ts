import { apiFetch, ORBLODE_API } from "@/lib/api/client";
import type { EpochMs } from "@/lib/time";

// orblode-svc's inbox, through /api/orblode. Every route answers for the signed-in person in the
// signed-in client only.

/** p1: someone has to act, or is waiting on it. p2: activity, which can be turned off. */
export type NotificationTier = "p1" | "p2";

export interface AppNotification {
  id: string;
  client_id: string;
  recipient_id: string;
  type: string;
  tier: NotificationTier;
  title: string;
  body?: string;
  /** An in-app path such as /viewer/:surveyId; absent when there is nowhere to go. */
  link?: string;
  project_id?: string;
  data?: Record<string, unknown>;
  /** 0 while unread. */
  read_at: EpochMs | 0;
  created_at: EpochMs;
}

export interface NotificationsPage {
  notifications: AppNotification[];
  total: number;
  page: number;
  page_size: number;
  unread: number;
}

export interface MarkedRead {
  updated: number;
  unread: number;
}

export interface NotificationTypePreference {
  type: string;
  tier: NotificationTier;
  label: string;
  mutable: boolean;
  muted: boolean;
  /** Reaches a browser with push on, unless push_muted. */
  pushable: boolean;
  push_muted: boolean;
}

export interface PushConfig {
  available: boolean;
  /** The VAPID key to subscribe with, base64url. */
  public_key?: string;
}

/** Same-origin server-sent events, proxied with the session cookie's bearer. */
export const NOTIFICATIONS_STREAM = `${ORBLODE_API}/notifications/stream`;

export function listNotifications(pageSize = 30): Promise<NotificationsPage> {
  return apiFetch<NotificationsPage>(ORBLODE_API, `/notifications?page=0&page_size=${pageSize}`);
}

export function markNotificationsRead(ids: string[]): Promise<MarkedRead> {
  return apiFetch<MarkedRead>(ORBLODE_API, "/notifications/read", { method: "PUT", body: { ids } });
}

export function markAllNotificationsRead(): Promise<MarkedRead> {
  return apiFetch<MarkedRead>(ORBLODE_API, "/notifications/read-all", { method: "PUT" });
}

export async function getNotificationPreferences(): Promise<NotificationTypePreference[]> {
  return (await apiFetch<{ types: NotificationTypePreference[] }>(ORBLODE_API, "/notifications/preferences")).types;
}

export async function saveNotificationPreferences(muted: string[], pushMuted: string[]): Promise<NotificationTypePreference[]> {
  return (
    await apiFetch<{ types: NotificationTypePreference[] }>(ORBLODE_API, "/notifications/preferences", {
      method: "PUT",
      body: { muted, push_muted: pushMuted },
    })
  ).types;
}

export function getPushConfig(): Promise<PushConfig> {
  return apiFetch<PushConfig>(ORBLODE_API, "/notifications/push");
}

/** Pushes this person's notices in the signed-in client to the browser that made the subscription. */
export async function savePushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  await apiFetch<null>(ORBLODE_API, "/notifications/push/subscription", { method: "PUT", body: subscription });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await apiFetch<null>(ORBLODE_API, "/notifications/push/subscription", { method: "DELETE", body: { endpoint } });
}
