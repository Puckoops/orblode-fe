"use client";

import { Alert, Button } from "@puckoops/camelot";
import { useEffect, useState } from "react";
import { useAuthUser } from "@/hooks/useAuth";
import { pushState, rememberPushOffer, shouldOfferPush, turnOnPush } from "@/lib/push/client";
import { toast } from "@/lib/toast";

/**
 * Offered once per browser, after a survey is dispatched: a browser notification when processing
 * finishes, so nobody has to keep Orblode open to find out. Settings can turn it on later.
 */
export function PushOffer() {
  const userId = useAuthUser()?.id;
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId || !shouldOfferPush()) return;
    let cancelled = false;
    pushState(userId).then(
      (state) => !cancelled && setShow(state === "off"),
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!show || !userId) return null;

  const dismiss = () => {
    rememberPushOffer("dismissed");
    setShow(false);
  };

  const accept = async () => {
    rememberPushOffer("accepted");
    setBusy(true);
    try {
      const state = await turnOnPush(userId);
      if (state === "on") toast.success("Browser notifications are on. Settings can change which ones.");
      else if (state === "blocked") toast.error("The browser blocked notifications from Orblode.");
    } catch {
      toast.error("Couldn't turn on browser notifications. Settings can try again.");
    } finally {
      setBusy(false);
      setShow(false);
    }
  };

  return (
    <Alert
      tone="info"
      title="Hear when processing finishes"
      onDismiss={dismiss}
      dismissLabel="Not now"
      action={
        <Button variant="ghost" onClick={() => void accept()} disabled={busy}>
          Turn on browser notifications
        </Button>
      }
    >
      Orblode can tell this browser when a survey is processed or fails, even with Orblode closed.
    </Alert>
  );
}
