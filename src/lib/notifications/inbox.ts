import type { AppNotification } from "../api/notifications.ts";
import { clockTime, daysAgo, shortDate, weekdayTime, type EpochMs } from "../time.ts";

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

/** Which part of the inbox a notice sits in, by the viewer's calendar. */
export type DayGroup = "today" | "yesterday" | "week" | "older";

export const DAY_GROUP_LABELS: Record<DayGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Last 7 days",
  older: "Older",
};

export function dayGroup(ms: EpochMs, now: EpochMs): DayGroup {
  const days = daysAgo(ms, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return "week";
  return "older";
}

/**
 * A notice's time, as precise as its group leaves room for: "Just now", "12 min ago" and "3 h ago"
 * today, "15:42" yesterday, "Mon 15:42" within the week, then "12 Oct".
 */
export function noticeTime(ms: EpochMs, now: EpochMs): string {
  switch (dayGroup(ms, now)) {
    case "today": {
      const minutes = Math.floor(Math.max(0, now - ms) / 60_000);
      if (minutes < 1) return "Just now";
      if (minutes < 60) return `${minutes} min ago`;
      return `${Math.floor(minutes / 60)} h ago`;
    }
    case "yesterday":
      return clockTime(ms);
    case "week":
      return weekdayTime(ms);
    default:
      return shortDate(ms, now);
  }
}

export interface NoticeGroup {
  group: DayGroup;
  label: string;
  notices: AppNotification[];
}

/** Notices, newest first, under their day's heading. */
export function groupNotices(notices: AppNotification[], now: EpochMs): NoticeGroup[] {
  const groups: NoticeGroup[] = [];
  for (const notice of notices) {
    const group = dayGroup(notice.created_at, now);
    const last = groups[groups.length - 1];
    if (last?.group === group) last.notices.push(notice);
    else groups.push({ group, label: DAY_GROUP_LABELS[group], notices: [notice] });
  }
  return groups;
}

/** The Chip tone a notice's icon takes: red for a failure, teal for finished work, amber for something to look at. */
export type NoticeTone = "red" | "teal" | "amber" | "neutral";

const NEEDS_A_LOOK = new Set(["uploads_unfinished", "stock_anomaly"]);

export function noticeTone(type: string): NoticeTone {
  const tone = toneFor(type);
  if (tone === "error") return "red";
  if (tone === "success") return "teal";
  return NEEDS_A_LOOK.has(type) ? "amber" : "neutral";
}
