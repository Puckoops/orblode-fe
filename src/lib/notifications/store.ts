import { create } from "zustand";
import { listNotifications, markAllNotificationsRead, markNotificationsRead, type AppNotification } from "@/lib/api/notifications";
import { arrivedWhileAway, markNoticesRead, mergeNotices } from "./inbox.ts";

interface InboxState {
  items: AppNotification[];
  unread: number;
  loaded: boolean;
  inboxOpen: boolean;
  setInboxOpen: (open: boolean) => void;
  /** Replaces the list with the server's newest page; resolves to what it found that was new and unread. */
  refresh: () => Promise<AppNotification[]>;
  /** Adds a notice that arrived live. */
  receive: (notice: AppNotification) => void;
  markRead: (ids: string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/** The signed-in person's Orblode inbox, shared by the bell, its card, the live connection and its toasts. */
export const useInbox = create<InboxState>((set, get) => ({
  items: [],
  unread: 0,
  loaded: false,
  inboxOpen: false,
  setInboxOpen: (open) => set({ inboxOpen: open }),

  refresh: async () => {
    try {
      const page = await listNotifications();
      const { items: before, loaded } = get();
      const items = mergeNotices([], page.notifications ?? []);
      set({ items, unread: page.unread, loaded: true });
      return loaded ? arrivedWhileAway(before, items) : [];
    } catch {
      // The bell keeps what it had; the next reconnect or reload tries again.
      return [];
    }
  },

  receive: (notice) => {
    const known = get().items.some((n) => n.id === notice.id);
    set((s) => ({ items: mergeNotices(s.items, [notice]), unread: s.unread + (!known && notice.read_at === 0 ? 1 : 0) }));
  },

  markRead: async (ids) => {
    const unreadIds = get().items.filter((n) => n.read_at === 0 && ids.includes(n.id)).map((n) => n.id);
    if (unreadIds.length === 0) return;
    set((s) => ({ items: markNoticesRead(s.items, unreadIds, Date.now()), unread: Math.max(0, s.unread - unreadIds.length) }));
    try {
      set({ unread: (await markNotificationsRead(unreadIds)).unread });
    } catch {
      await get().refresh();
    }
  },

  markAllRead: async () => {
    set((s) => ({ items: markNoticesRead(s.items, "all", Date.now()), unread: 0 }));
    try {
      set({ unread: (await markAllNotificationsRead()).unread });
    } catch {
      await get().refresh();
    }
  },
}));
