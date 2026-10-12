"use client";

import { Notification03Icon } from "@hugeicons/core-free-icons";
import { Badge, IconButton, Tooltip } from "@puckoops/camelot";
import { useInbox } from "@/lib/notifications/store";
import { NotificationsDrawer } from "./NotificationsDrawer";
import styles from "./notifications.module.css";

/**
 * The bell at the top right with the unread count; it opens the inbox drawer. In the topbar it sits
 * flat; over the viewer's canvas it floats on a surface like the canvas's other controls.
 */
export function NotificationsBell({ placement = "topbar" }: { placement?: "topbar" | "canvas" }) {
  const open = useInbox((s) => s.drawerOpen);
  const setOpen = useInbox((s) => s.setDrawerOpen);
  const unread = useInbox((s) => s.unread);
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <>
      <span className={`${styles.bell} ${placement === "canvas" ? styles.bellFloating : ""}`}>
        <Tooltip content={label} side={placement === "canvas" ? "left" : "bottom"}>
          <IconButton icon={Notification03Icon} aria-label={label} variant={placement === "canvas" ? "bare" : "ghost"} onClick={() => setOpen(true)} />
        </Tooltip>
        {unread > 0 && (
          <Badge variant="count" strong max={99} className={styles.bellCount} aria-hidden>
            {unread}
          </Badge>
        )}
      </span>
      <NotificationsDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
