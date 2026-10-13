"use client";

import { Notification03Icon } from "@hugeicons/core-free-icons";
import { Button, Drawer, EmptyState, TextLink } from "@puckoops/camelot";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppNotification } from "@/lib/api/notifications";
import { followNoticeLink } from "@/lib/notifications/follow";
import { relativeTime } from "@/lib/notifications/inbox";
import { useSiteNames } from "@/lib/notifications/siteNames";
import { useInbox } from "@/lib/notifications/store";
import { useWorkspaces } from "@/lib/workspaces/store";
import styles from "./notifications.module.css";

/** The inbox: newest first, each notice with its site's name, and its workspace when that is not the open one. Opening a
 * notice marks it read and goes where it points, switching workspace with it. */
export function NotificationsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const items = useInbox((s) => s.items);
  const unread = useInbox((s) => s.unread);
  const markRead = useInbox((s) => s.markRead);
  const markAllRead = useInbox((s) => s.markAllRead);
  const [now, setNow] = useState(() => Date.now());
  const siteNames = useSiteNames((s) => s.names);
  const siteWorkspaces = useSiteNames((s) => s.workspaces);
  const workspaces = useWorkspaces((s) => s.workspaces);
  const currentId = useWorkspaces((s) => s.currentId);
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

  const placeOf = (projectId: string | undefined) => {
    const site = projectId ? siteNames[projectId] : undefined;
    if (!projectId || !site) return null;
    const home = siteWorkspaces[projectId];
    const workspace = home && home !== currentId ? workspaces?.find((w) => w.id === home)?.name : undefined;
    return workspace ? `${site} in ${workspace} · ` : `${site} · `;
  };

  const openNotice = (notice: AppNotification) => {
    void markRead([notice.id]);
    if (notice.link) {
      onOpenChange(false);
      void followNoticeLink(notice.link, router.push);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      description={unread > 0 ? `${unread} unread` : "You're up to date."}
      footer={
        <div className="flex w-full items-center justify-between gap-4">
          <TextLink as={Link} href="/settings?tab=notifications" onClick={() => onOpenChange(false)}>
            Notification settings
          </TextLink>
          <Button variant="ghost" onClick={() => void markAllRead()} disabled={unread === 0}>
            Mark all read
          </Button>
        </div>
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
                  {placeOf(notice.project_id)}
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
