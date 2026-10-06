"use client";

import { Button, Dialog } from "@puckoops/camelot";
import { useCallback, useState, type ReactElement, type ReactNode } from "react";

// Confirmation gate for destructive actions (ORB-37). The caller keeps its own handler but routes it
// through `confirm({...})` and renders `confirmDialog` in its own tree, so a trigger that unmounts on
// click (the scene context menu closes itself) still gets a working confirmation.

export interface ConfirmRequest {
  title: string;
  /** Say what will actually happen, especially anything that cascades or cannot be undone. */
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Awaited: an async confirm keeps the dialog open, busy, until it settles. */
  onConfirm: () => void | Promise<void>;
}

function ConfirmDialog({ request, onOpenChange }: { request: ConfirmRequest | null; onOpenChange: (open: boolean) => void }) {
  const [pending, setPending] = useState(false);

  const run = async () => {
    if (!request || pending) return;
    try {
      setPending(true);
      await request.onConfirm();
    } finally {
      // Failures surface through the caller's own toast; the dialog always closes so it can never wedge shut.
      setPending(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => !pending && onOpenChange(open)}
      title={request?.title ?? ""}
      footer={
        // Cancel first in DOM order, so Enter on an unread dialog cancels rather than deletes.
        <>
          <Button variant="quiet" disabled={pending} onClick={() => onOpenChange(false)}>
            {request?.cancelLabel ?? "Cancel"}
          </Button>
          <Button variant="primary" loading={pending} onClick={() => void run()}>
            {request?.confirmLabel ?? "Delete"}
          </Button>
        </>
      }
    >
      <p className="small text-ink-2">{request?.description}</p>
    </Dialog>
  );
}

/** Owns the pending confirmation and its dialog: render `confirmDialog` in the host, and call
 * `confirm(request)` from the destructive handler instead of acting directly. */
export function useConfirm(): { confirm: (request: ConfirmRequest) => void; confirmDialog: ReactElement } {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirm = useCallback((next: ConfirmRequest) => setRequest(next), []);
  const confirmDialog = (
    <ConfirmDialog
      request={request}
      onOpenChange={(open) => {
        if (!open) setRequest(null);
      }}
    />
  );
  return { confirm, confirmDialog };
}
