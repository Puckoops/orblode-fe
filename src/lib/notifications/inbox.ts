import type { AppNotification } from "../api/notifications.ts";

/** How many notices the bell keeps in memory; older ones are a refetch away. */
export const INBOX_LIMIT = 50;

/** Adds or replaces notices by id, newest first, keeping at most INBOX_LIMIT. */
export function mergeNotices(current: AppNotification[], incoming: AppNotification[]): AppNotification[] {
  const byId = new Map(current.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, n);
  return [...byId.values()]
    .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice(0, INBOX_LIMIT);
}

/** Marks the given ids read at `at`, or every notice when ids is "all"; read ones keep their time. */
export function markNoticesRead(current: AppNotification[], ids: string[] | "all", at: number): AppNotification[] {
  const wanted = ids === "all" ? null : new Set(ids);
  return current.map((n) => (n.read_at === 0 && (!wanted || wanted.has(n.id)) ? { ...n, read_at: at } : n));
}

/** Toast tone for a live notice: failures and red reconciliations read as failures, finished work as success. */
export function toneFor(type: string): "error" | "success" | "default" {
  if (type.endsWith("_failed") || type.endsWith("_red")) return "error";
  if (type.endsWith("_processed") || type.endsWith("_ready") || type.endsWith("_computed")) return "success";
  return "default";
}

/**
 * The unread notices a reload found that the inbox didn't have, oldest first: what arrived while the
 * live stream was down, which nothing has toasted yet.
 */
export function arrivedWhileAway(before: AppNotification[], after: AppNotification[]): AppNotification[] {
  const known = new Set(before.map((n) => n.id));
  return after.filter((n) => n.read_at === 0 && !known.has(n.id)).sort((a, b) => a.created_at - b.created_at);
}

/** From this many notices arriving together, one toast stands for them all. */
export const BURST_SIZE = 3;

export interface NoticeToast {
  title: string;
  body?: string;
  link?: string;
  tone: "error" | "success" | "default";
  /** The notice a single toast is for; a burst has none and opens the inbox instead. */
  id?: string;
}

/**
 * The toasts for notices that arrived live together (oldest first): one each, or one for a burst,
 * led by a notice someone has to act on when there is one.
 */
export function toastsFor(notices: AppNotification[]): NoticeToast[] {
  if (notices.length < BURST_SIZE) {
    return notices.map((n) => ({ title: n.title, body: n.body, link: n.link, tone: toneFor(n.type), id: n.id }));
  }
  const lead = notices.find((n) => n.tier === "p1") ?? notices[notices.length - 1];
  const failed = notices.some((n) => toneFor(n.type) === "error");
  return [{ title: `${notices.length} new notifications`, body: `${lead.title}, and ${notices.length - 1} more.`, tone: failed ? "error" : "default" }];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "just now", "5 min ago", "3 h ago", "2 d ago", then "12 Oct" (with the year when it isn't this one). */
export function relativeTime(ms: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  const d = new Date(ms);
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? label : `${label} ${d.getFullYear()}`;
}
