"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import styles from "./landing.module.css";

type Phase = { kind: "idle" } | { kind: "sending" } | { kind: "failed"; message: string } | { kind: "sent"; name: string; email: string };

export type DemoPrefill = { email?: string };

const OpenDemoRequest = createContext<(prefill?: DemoPrefill) => void>(() => {});

export const useDemoRequest = () => useContext(OpenDemoRequest);

export function RequestDemoButton({ className, children = "Request a demo" }: { className?: string; children?: ReactNode }) {
  const open = useDemoRequest();
  return (
    <button type="button" onClick={() => open()} className={className}>
      {children}
    </button>
  );
}

/** Owns the demo-request modal; anything inside can open it through useDemoRequest or RequestDemoButton. */
export function DemoRequestProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const pressedBackdrop = useRef(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const open = useCallback((prefill?: DemoPrefill) => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    if (prefill?.email && emailRef.current) emailRef.current.value = prefill.email;
    nameRef.current?.focus();
  }, []);

  const close = () => dialogRef.current?.close();

  useEffect(() => {
    if (phase.kind === "sent") doneRef.current?.focus();
  }, [phase.kind]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setPhase({ kind: "sending" });
    try {
      const res = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const json = (await res.json().catch(() => null)) as { error?: boolean; message?: string } | null;
      if (!res.ok || json?.error) {
        setPhase({ kind: "failed", message: json?.message ?? "We couldn't send that just now. Try again in a moment." });
        return;
      }
      setPhase({ kind: "sent", name: data.name.trim().split(/\s+/)[0], email: data.email.trim().toLowerCase() });
    } catch {
      setPhase({ kind: "failed", message: "You seem to be offline. Check your connection and try again." });
    }
  };

  return (
    <OpenDemoRequest.Provider value={open}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="demo-title"
        className={styles.modal}
        onClose={() => {
          if (phase.kind === "sent") setPhase({ kind: "idle" });
        }}
        // Only a press that starts and ends on the backdrop closes, so a text selection dragged out of a field doesn't.
        onPointerDown={(e) => {
          pressedBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (pressedBackdrop.current && e.target === e.currentTarget) close();
        }}
      >
        <div className={styles.modalBody}>
          <button type="button" onClick={close} aria-label="Close" className={`${styles.iconButton} ${styles.modalClose}`}>
            <svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" strokeWidth="1.3" fill="none" aria-hidden="true">
              <line x1="4" y1="4" x2="14" y2="14" />
              <line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>

          {phase.kind === "sent" ? (
            <div className={styles.modalHead}>
              <h2 id="demo-title" className={`${styles.title} ${styles.modalTitle}`}>
                Thanks, <span className={styles.accent}>{phase.name}.</span>
              </h2>
              <p className={styles.modalLede}>We&apos;ll be in touch at {phase.email} to set up your demo.</p>
              <button ref={doneRef} type="button" onClick={close} className={`${styles.pill} ${styles.modalDone}`}>
                Done
              </button>
            </div>
          ) : (
            <>
              <div className={styles.modalHead}>
                <h2 id="demo-title" className={`${styles.title} ${styles.modalTitle}`}>
                  See your site from <span className={styles.accent}>altitude.</span>
                </h2>
                <p className={styles.modalLede}>Tell us about your site and we&apos;ll set up a walkthrough.</p>
              </div>
              <form onSubmit={submit} className={styles.form}>
                <div className={styles.formRow}>
                  <div>
                    <label htmlFor="demo-name" className={styles.label}>
                      Name
                    </label>
                    <input ref={nameRef} id="demo-name" name="name" type="text" required maxLength={120} autoComplete="name" placeholder="Your name" className={styles.input} />
                  </div>
                  <div>
                    <label htmlFor="demo-email" className={styles.label}>
                      Email
                    </label>
                    <input ref={emailRef} id="demo-email" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@company.com" className={styles.input} />
                  </div>
                </div>
                <div>
                  <label htmlFor="demo-company" className={styles.label}>
                    Company
                  </label>
                  <input id="demo-company" name="company" type="text" maxLength={160} autoComplete="organization" placeholder="Company name" className={styles.input} />
                </div>
                <div>
                  <label htmlFor="demo-message" className={styles.label}>
                    Message
                  </label>
                  <textarea id="demo-message" name="message" rows={3} maxLength={4000} placeholder="Tell us about your site" className={`${styles.input} ${styles.textarea}`} />
                </div>
                <div aria-hidden="true" className={styles.honeypot}>
                  <label htmlFor="demo-website">Website</label>
                  <input id="demo-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                </div>
                {phase.kind === "failed" && (
                  <p role="alert" className={styles.formError}>
                    {phase.message}
                  </p>
                )}
                <button type="submit" disabled={phase.kind === "sending"} className={`${styles.pill} ${styles.submit}`}>
                  {phase.kind === "sending" ? "Sending…" : "Request a demo"}
                </button>
              </form>
              <p className={styles.modalFoot}>
                Or email <a href="mailto:contact@orblode.com">contact@orblode.com</a>
              </p>
            </>
          )}
        </div>
      </dialog>
    </OpenDemoRequest.Provider>
  );
}
