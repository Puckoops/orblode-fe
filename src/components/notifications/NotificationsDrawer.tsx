"use client";

import { Notification03Icon } from "@hugeicons/core-free-icons";
import { Button, Drawer, EmptyState } from "@puckoops/camelot";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppNotification } from "@/lib/api/notifications";
import { relativeTime } from "@/lib/notifications/inbox";
import { useSiteNames } from "@/lib/notifications/siteNames";
import { useInbox } from "@/lib/notifications/store";
import styles from "./notifications.module.css";

/** The inbox: newest first, each notice with its site's name. Opening a notice marks it read and goes where it points. */
export function NotificationsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const items = useInbox((s) => s.items);
  const unread = useInbox((s) => s.unread);
  const markRead = useInbox((s) => s.markRead);
  const markAllRead = useInbox((s) => s.markAllRead);
  const [now, setNow] = useState(() => Date.now());
  const siteNames = useSiteNames((s) => s.names);
  const ensureSiteNames = useSiteNames((s) => s.ensure);

  useEffect(() => {
    if (!open) return;
    const ids = items.flatMap((n) => (n.project_id ? [n.project_id] : []));
    if (ids.length > 0) void ensureSiteNames(ids);
  }, [open, items, ensureSiteNames]);

  useEffect(() => {
    if (!open) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [open]);

  const openNotice = (notice: AppNotification) => {
    void markRead([notice.id]);
    if (notice.link) {
      onOpenChange(false);
      router.push(notice.link);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      description={unread > 0 ? `${unread} unread` : "You're up to date."}
      footer={
        <Button variant="ghost" onClick={() => void markAllRead()} disabled={unread === 0}>
          Mark all read
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={Notification03Icon} title="Survey results, failures and site alerts will show up here." />
      ) : (
        <ul className={styles.list}>
          {items.map((notice) => (
            <li key={notice.id}>
              <button
                type="button"
                className={`${styles.item} ${notice.read_at === 0 ? styles.unread : ""}`}
                onClick={() => openNotice(notice)}
              >
                <span className={styles.dot} aria-hidden />
                <span className={styles.title}>
                  {notice.read_at === 0 && <span className="visually-hidden">Unread: </span>}
                  {notice.title}
                </span>
                {notice.body && <span className={`small ${styles.body}`}>{notice.body}</span>}
                <span className={`small ${styles.when}`}>
                  {notice.project_id && siteNames[notice.project_id] ? `${siteNames[notice.project_id]} · ` : null}
                  {relativeTime(notice.created_at, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
