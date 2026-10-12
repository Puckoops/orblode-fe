"use client";

import { TextLink, toast } from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { NOTIFICATIONS_STREAM, type AppNotification } from "@/lib/api/notifications";
import { toastsFor, type NoticeToast } from "@/lib/notifications/inbox";
import { useAuthUser } from "@/hooks/useAuth";
import { useInbox } from "@/lib/notifications/store";
import { useProcessing } from "@/lib/processing/store";
import { syncPush } from "@/lib/push/client";
import { useSiteAlerts } from "@/lib/reports/alerts";

/**
 * Some notices change what the rail counts: a survey notice which surveys have failed (and maybe
 * the one open in the viewer), a red reconciliation which sites reconcile red.
 */
function follow(notice: AppNotification) {
  if (notice.type === "reconciliation_red") void useSiteAlerts.getState().refresh();
  if (!notice.type.startsWith("survey_")) return;
  const processing = useProcessing.getState();
  void processing.refreshFailed();
  const surveyId = notice.data?.survey_id;
  if (typeof surveyId === "string" && processing.current?.survey_id === surveyId) void processing.loadCurrent(surveyId);
}

/** After the stream gives up (it answered an error, not a dropped connection), try again this much later. */
const RECONNECT_MS = 30_000;

/** Notices arriving this close together are toasted together, so a burst becomes one toast. */
const BURST_WINDOW_MS = 800;

/**
 * A healthy stream ends and reconnects within about a minute (the stream route's cap, or a load
 * balancer's sooner), firing ready each time; one silent for longer than this is dead.
 */
const STALE_AFTER_MS = 90_000;
const WATCH_EVERY_MS = 30_000;

function announce({ id, title, body, link, tone }: NoticeToast) {
  const inbox = useInbox.getState();
  let action: ReactNode = null;
  if (!id) {
    action = (
      <TextLink as="button" type="button" onClick={() => inbox.setDrawerOpen(true)}>
        Show all
      </TextLink>
    );
  } else if (link) {
    action = (
      <TextLink as={Link} href={link} onClick={() => void inbox.markRead([id])}>
        Open
      </TextLink>
    );
  }
  const description = (
    <>
      {body}
      {action && (
        <>
          {body ? " " : null}
          {action}
        </>
      )}
    </>
  );
  toast(title, { description, tone });
}

/**
 * Keeps the inbox and the rail's counts (failed surveys, red sites) current while Orblode is open:
 * loads them, then listens for new notices and toasts each as it arrives. Nothing is replayed over
 * the stream, so every reconnect reloads them all and toasts what came in while it was down. It
 * also renews this browser's push subscription for whoever turned push on here. Renders nothing.
 */
export function NotificationsLive() {
  const userId = useAuthUser()?.id;
  const refresh = useInbox((s) => s.refresh);
  const receive = useInbox((s) => s.receive);
  const refreshFailed = useProcessing((s) => s.refreshFailed);
  const refreshAlerts = useSiteAlerts((s) => s.refresh);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let connectedBefore = false;
    let stopped = false;
    let lastReady = Date.now();
    let arrived: AppNotification[] = [];
    let burst: ReturnType<typeof setTimeout> | undefined;

    const toastArrived = () => {
      toastsFor(arrived).forEach(announce);
      arrived = [];
      burst = undefined;
    };

    const queue = (notices: AppNotification[]) => {
      if (notices.length === 0) return;
      arrived.push(...notices);
      burst ??= setTimeout(toastArrived, BURST_WINDOW_MS);
    };

    const connect = () => {
      clearTimeout(retry);
      source?.close();
      lastReady = Date.now();
      source = new EventSource(NOTIFICATIONS_STREAM);
      source.addEventListener("ready", () => {
        lastReady = Date.now();
        if (connectedBefore) {
          // Nothing is replayed, so whatever arrived while the stream was down is only in a reload.
          void refresh().then(queue);
          void refreshFailed();
          void refreshAlerts();
        }
        connectedBefore = true;
      });
      source.addEventListener("notification", (event) => {
        let notice: AppNotification;
        try {
          notice = JSON.parse((event as MessageEvent<string>).data);
        } catch {
          return;
        }
        receive(notice);
        follow(notice);
        queue([notice]);
      });
      source.onerror = () => {
        // A dropped connection reconnects by itself; a refused one is CLOSED and stays so.
        if (stopped || source?.readyState !== EventSource.CLOSED) return;
        source.close();
        retry = setTimeout(connect, RECONNECT_MS);
      };
    };

    // A tab that slept, froze or lost the network can hold a dead stream, or none waiting on a
    // throttled timer. In view again, it reconnects at once.
    const wake = () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (!source || source.readyState === EventSource.CLOSED || Date.now() - lastReady > STALE_AFTER_MS) connect();
    };
    const watchdog = setInterval(wake, WATCH_EVERY_MS);
    document.addEventListener("visibilitychange", wake);
    document.addEventListener("resume", wake);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);

    void refresh();
    void refreshFailed();
    void refreshAlerts();
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(burst);
      clearInterval(watchdog);
      document.removeEventListener("visibilitychange", wake);
      document.removeEventListener("resume", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
      source?.close();
    };
  }, [refresh, receive, refreshFailed, refreshAlerts]);

  useEffect(() => {
    if (userId) void syncPush(userId).catch(() => undefined);
  }, [userId]);

  return null;
}
