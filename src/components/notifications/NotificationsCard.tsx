"use client";

import {
  Building03Icon,
  Calendar03Icon,
  ChartLineData01Icon,
  CloudUploadIcon,
  DocumentValidationIcon,
  Layers01Icon,
  MapsIcon,
  MountainIcon,
  Notification03Icon,
  RulerIcon,
  Settings02Icon,
  Share08Icon,
  Tick02Icon,
  TickDouble02Icon,
  UserCheck01Icon,
} from "@hugeicons/core-free-icons";
import {
  Badge,
  Button,
  EmptyState,
  Glyph,
  Icon,
  IconButton,
  SegmentedControl,
  Tooltip,
  type GlyphShape,
  type IconDefinition,
} from "@puckoops/camelot";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppNotification } from "@/lib/api/notifications";
import { followNoticeLink } from "@/lib/notifications/follow";
import { groupNotices, noticeTime, noticeTone, type NoticeTone } from "@/lib/notifications/inbox";
import { useSiteNames } from "@/lib/notifications/siteNames";
import { useInbox } from "@/lib/notifications/store";
import { exactTime } from "@/lib/time";
import { useWorkspaces } from "@/lib/workspaces/store";
import styles from "./notifications.module.css";

const TYPE_ICONS: Record<string, IconDefinition> = {
  survey_processed: MapsIcon,
  survey_failed: MapsIcon,
  uploads_unfinished: CloudUploadIcon,
  design_ready: Layers01Icon,
  design_failed: Layers01Icon,
  measurement_computed: RulerIcon,
  measurement_failed: RulerIcon,
  stockpiles_computed: MountainIcon,
  reconciliation_red: DocumentValidationIcon,
  stock_anomaly: ChartLineData01Icon,
  site_summary: Calendar03Icon,
  member_joined: UserCheck01Icon,
  added_to_organisation: Building03Icon,
  survey_shared: Share08Icon,
};

const TONE_MARKS: Partial<Record<NoticeTone, GlyphShape>> = { red: "cross", teal: "check", amber: "triangle" };

type Filter = "all" | "unread";

function NoticeRow({
  notice,
  now,
  place,
  onOpen,
  onMarkRead,
}: {
  notice: AppNotification;
  now: number;
  place: string | null;
  onOpen: (notice: AppNotification) => void;
  onMarkRead: (id: string) => void;
}) {
  const unread = notice.read_at === 0;
  const tone = noticeTone(notice.type);
  const mark = TONE_MARKS[tone];
  return (
    <li className={`${styles.row} ${unread ? styles.unread : ""}`}>
      <button type="button" className={styles.open} onClick={() => onOpen(notice)}>
        <span className={styles.icon} data-tone={tone} aria-hidden>
          <Icon icon={TYPE_ICONS[notice.type] ?? Notification03Icon} size={16} />
          {mark && (
            <span className={styles.mark}>
              <Glyph shape={mark} size={8} />
            </span>
          )}
        </span>
        <span className={styles.text}>
          <span className={styles.titleRow}>
            <span className={styles.title}>
              {unread && <span className="visually-hidden">Unread: </span>}
              {notice.title}
            </span>
            <time className={styles.time} dateTime={new Date(notice.created_at).toISOString()} title={exactTime(notice.created_at)}>
              {noticeTime(notice.created_at, now)}
            </time>
          </span>
          {notice.body && <span className={styles.body}>{notice.body}</span>}
          {place && <span className={styles.place}>{place}</span>}
        </span>
      </button>
      {unread && (
        <>
          <span className={styles.dot} aria-hidden />
          <IconButton className={styles.markRead} icon={Tick02Icon} aria-label="Mark as read" variant="bare" size="sm" onClick={() => onMarkRead(notice.id)} />
        </>
      )}
    </li>
  );
}

/**
 * The inbox the bell opens, as a card under it: newest first under day headings, each notice with
 * its kind's icon, its site (and workspace when that isn't the open one) and a time as exact as its
 * day allows. Opening a notice marks it read and goes where it points, switching organisation when
 * it names another.
 */
export function NotificationsCard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const items = useInbox((s) => s.items);
  const unread = useInbox((s) => s.unread);
  const markRead = useInbox((s) => s.markRead);
  const markAllRead = useInbox((s) => s.markAllRead);
  const siteNames = useSiteNames((s) => s.names);
  const siteWorkspaces = useSiteNames((s) => s.workspaces);
  const ensureSiteNames = useSiteNames((s) => s.ensure);
  const workspaces = useWorkspaces((s) => s.workspaces);
  const currentId = useWorkspaces((s) => s.currentId);
  const [filter, setFilter] = useState<Filter>("all");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const ids = items.flatMap((n) => (n.project_id ? [n.project_id] : []));
    if (ids.length > 0) void ensureSiteNames(ids);
  }, [items, ensureSiteNames]);

  useEffect(() => {
    const every = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(every);
  }, []);

  const placeOf = (projectId: string | undefined) => {
    const site = projectId ? siteNames[projectId] : undefined;
    if (!projectId || !site) return null;
    const home = siteWorkspaces[projectId];
    const workspace = home && home !== currentId ? workspaces?.find((w) => w.id === home)?.name : undefined;
    return workspace ? `${site} · ${workspace}` : site;
  };

  const openNotice = (notice: AppNotification) => {
    void markRead([notice.id]);
    if (!notice.link) return;
    onClose();
    void followNoticeLink(notice.link, router.push);
  };

  const openSettings = () => {
    onClose();
    router.push("/settings?tab=notifications");
  };

  const shown = filter === "unread" ? items.filter((n) => n.read_at === 0) : items;
  const groups = groupNotices(shown, now);

  return (
    <>
      <header className={styles.head}>
        <div className={styles.headTitle}>
          <h2 className="h3">Notifications</h2>
          {unread > 0 && (
            <Badge variant="count" strong max={99}>
              {unread}
            </Badge>
          )}
        </div>
        <div className={styles.headActions}>
          <Button variant="quiet" size="sm" iconStart={TickDouble02Icon} disabled={unread === 0} onClick={() => void markAllRead()}>
            Mark all read
          </Button>
          <Tooltip content="Notification settings">
            <IconButton icon={Settings02Icon} aria-label="Notification settings" variant="bare" size="sm" onClick={openSettings} />
          </Tooltip>
        </div>
      </header>
      <div className={styles.filters}>
        <SegmentedControl<Filter>
          size="sm"
          aria-label="Which notifications"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "unread", label: unread > 0 ? `Unread (${unread})` : "Unread" },
          ]}
        />
      </div>
      <div className={styles.scroll}>
        {groups.length === 0 ? (
          <EmptyState
            className={styles.empty}
            icon={Notification03Icon}
            title={filter === "unread" ? "You’ve read everything." : "Nothing here yet."}
            description={filter === "unread" ? undefined : "Survey results, failures, site alerts and people joining will show up here."}
          />
        ) : (
          groups.map((g) => (
            <section key={g.group} aria-label={g.label}>
              <h3 className={`caps ${styles.groupLabel}`}>{g.label}</h3>
              <ul className={styles.list}>
                {g.notices.map((notice) => (
                  <NoticeRow
                    key={notice.id}
                    notice={notice}
                    now={now}
                    place={placeOf(notice.project_id)}
                    onOpen={openNotice}
                    onMarkRead={(id) => void markRead([id])}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}
