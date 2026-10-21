"use client";

import { Add01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import {
  Alert,
  Button,
  Dialog,
  HelperText,
  IconButton,
  Input,
  Skeleton,
} from "@puckoops/camelot";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { getSettings, type Report } from "@/lib/api/mm";
import { listOrgMembers, type OrgMember } from "@/lib/api/userSvc";
import { toast } from "@/lib/toast";

type Step = { label: string; reviewer_ids: string[] };

const SUGGESTED = ["Tahasildar", "Sub-Collector", "District Mining Officer"];

/** Names the review chain and sends a report along it. It starts from the chain given, else the workspace's default
 * chain, and offers as reviewers only the people who can vet on the site. */
export function SendForVettingDialog({
  title = "Send for vetting",
  description = "Each step is decided by any one of its reviewers, in order. Reviewers are the people who can vet reports on this project.",
  initialSteps,
  reviewers,
  send,
  onClose,
  onDone,
}: {
  title?: string;
  description?: string;
  initialSteps?: Step[];
  reviewers: () => Promise<string[]>;
  send: (steps: Step[]) => Promise<Report>;
  onClose: () => void;
  onDone: (report: Report) => void;
}) {
  const [people, setPeople] = useState<OrgMember[] | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(
    initialSteps?.length ? initialSteps : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opening = useRef({ reviewers, initialSteps });

  useEffect(() => {
    let live = true;
    const { reviewers, initialSteps } = opening.current;
    Promise.all([reviewers(), listOrgMembers()])
      .then(
        ([ids, members]) =>
          live && setPeople(members.filter((m) => ids.includes(m.user_id))),
      )
      .catch(() => live && setPeople([]));
    if (!initialSteps?.length) {
      getSettings()
        .then(
          (s) =>
            live &&
            setSteps(
              s.review_chain.map((c) => ({
                label: c.label,
                reviewer_ids: [...c.reviewer_ids],
              })),
            ),
        )
        .catch(
          () => live && setSteps([{ label: SUGGESTED[0], reviewer_ids: [] }]),
        );
    }
    return () => {
      live = false;
    };
  }, []);

  const toggle = (i: number, uid: string, on: boolean) =>
    setSteps(
      (list) =>
        list &&
        list.map((s, k) =>
          k === i
            ? {
                ...s,
                reviewer_ids: on
                  ? [...s.reviewer_ids, uid]
                  : s.reviewer_ids.filter((x) => x !== uid),
              }
            : s,
        ),
    );

  const eligible = (s: Step) =>
    people
      ? s.reviewer_ids.filter((id) => people.some((p) => p.user_id === id))
      : s.reviewer_ids;

  const submit = async () => {
    // A default chain may name people who can't vet on this site; only the ones who can are sent.
    const chain = (steps ?? []).map((s) => ({
      label: s.label.trim(),
      reviewer_ids: eligible(s),
    }));
    if (
      chain.length === 0 ||
      chain.some((s) => !s.label || s.reviewer_ids.length === 0)
    ) {
      setError("Name every step and give it at least one reviewer.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await send(chain));
      toast.success(
        "Sent for vetting: the first step's reviewers have a notice.",
      );
      onClose();
    } catch (err) {
      setError(refusalMessage(err, "Couldn't send the report. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title={title}
      description={description}
      width={640}
      footer={
        <>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => void submit()}
          >
            Send
          </Button>
        </>
      }
    >
      {!people || !steps ? (
        <Skeleton height={160} />
      ) : people.length === 0 ? (
        <Alert tone="warning" title="Nobody can vet reports on this project yet">
          Give the officials a role that can vet, such as the Authority reviewer
          role in <Link href="/settings?tab=roles">Settings → Roles</Link>, on
          this project or its workspace.
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          {steps.map((s, i) => (
            <fieldset
              key={i}
              className="flex flex-col gap-2 rounded-md border border-hairline p-3"
            >
              <div className="flex items-center gap-2">
                <span className="caption shrink-0 whitespace-nowrap text-ink-4">
                  Step {i + 1}
                </span>
                <Input
                  aria-label={`Name of step ${i + 1}`}
                  value={s.label}
                  onChange={(e) =>
                    setSteps(
                      steps.map((x, k) =>
                        k === i ? { ...x, label: e.target.value } : x,
                      ),
                    )
                  }
                />
                {steps.length > 1 && (
                  <IconButton
                    icon={Delete02Icon}
                    aria-label={`Remove step ${i + 1}`}
                    variant="bare"
                    size="sm"
                    onClick={() => setSteps(steps.filter((_, k) => k !== i))}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1">
                {people.map((p) => (
                  <label
                    key={p.user_id}
                    className="small flex items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={eligible(s).includes(p.user_id)}
                      onChange={(e) => toggle(i, p.user_id, e.target.checked)}
                    />
                    {p.name || p.email}
                    {p.name && p.email && (
                      <span className="caption text-ink-4">{p.email}</span>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {steps.length < 6 && (
            <div>
              <Button
                size="sm"
                variant="quiet"
                iconStart={Add01Icon}
                onClick={() =>
                  setSteps([
                    ...steps,
                    { label: SUGGESTED[steps.length] ?? "", reviewer_ids: [] },
                  ])
                }
              >
                Add a step
              </Button>
            </div>
          )}
        </div>
      )}
      {error && (
        <HelperText tone="error" role="alert" className="mt-3">
          {error}
        </HelperText>
      )}
    </Dialog>
  );
}
