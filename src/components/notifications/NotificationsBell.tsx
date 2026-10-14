"use client";

import { Notification03Icon } from "@hugeicons/core-free-icons";
import { Badge, IconButton, Tooltip } from "@puckoops/camelot";
import { Popover } from "radix-ui";
import { useRef } from "react";
import { useInbox } from "@/lib/notifications/store";
import { NotificationsCard } from "./NotificationsCard";
import styles from "./notifications.module.css";

/**
 * The bell at the top right with the unread count; it opens the inbox as a card beneath it. In the
 * topbar it sits flat; over the viewer's canvas it floats on a surface like the canvas's other controls.
 */
export function NotificationsBell({ placement = "topbar" }: { placement?: "topbar" | "canvas" }) {
  const open = useInbox((s) => s.inboxOpen);
  const setOpen = useInbox((s) => s.setInboxOpen);
  const unread = useInbox((s) => s.unread);
  const bell = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <span ref={bell} className={`${styles.bell} ${placement === "canvas" ? styles.bellFloating : ""}`}>
          <Tooltip content={label} side={placement === "canvas" ? "left" : "bottom"}>
            <IconButton
              ref={button}
              icon={Notification03Icon}
              aria-label={label}
              aria-haspopup="dialog"
              aria-expanded={open}
              variant={placement === "canvas" ? "bare" : "ghost"}
              onClick={() => setOpen(!open)}
            />
          </Tooltip>
          {unread > 0 && (
            <Badge variant="count" strong max={99} className={styles.bellCount} aria-hidden>
              {unread}
            </Badge>
          )}
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          ref={card}
          className={styles.card}
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Notifications"
          tabIndex={-1}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            card.current?.focus();
          }}
          // Back to the bell when the card closes from inside it; a click elsewhere keeps its own focus.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const focused = document.activeElement;
            if (!focused || focused === document.body || card.current?.contains(focused)) button.current?.focus();
          }}
          // The bell toggles the card itself; letting its press count as outside would close and reopen it.
          onInteractOutside={(event) => {
            if (event.target instanceof Node && bell.current?.contains(event.target)) event.preventDefault();
          }}
        >
          <NotificationsCard onClose={() => setOpen(false)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
