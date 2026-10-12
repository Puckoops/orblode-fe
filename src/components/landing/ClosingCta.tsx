"use client";

import { useState, type FormEvent } from "react";
import type { Picture } from "@/lib/landing/media";
import { useDemoRequest } from "./DemoRequest";
import styles from "./landing.module.css";
import { LandingPicture } from "./LandingPicture";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The closing request: a work email here opens the demo form with the address already filled in. */
export function ClosingCta({ backdrop }: { backdrop: Picture }) {
  const openDemo = useDemoRequest();
  const [error, setError] = useState("");

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!EMAIL.test(email)) {
      setError("Enter a work email, like name@company.com.");
      return;
    }
    setError("");
    openDemo({ email });
  };

  return (
    <section id="demo" aria-labelledby="demo-cta-title" className={styles.closing}>
      <div className={`${styles.window} ${styles.closingWindow}`}>
        <LandingPicture picture={backdrop} alt="" className={`${styles.layer} ${styles.mediaCover}`} />
        <div aria-hidden="true" className={`${styles.layer} ${styles.closingScrim}`} />
        <div className={styles.closingCopy}>
          <h2 id="demo-cta-title" className={styles.closingTitle}>
            Bring one survey. See your site as a twin.
          </h2>
          <p>Send us a recent flight and we&apos;ll walk your team through volumes, change and as-built on your own ground.</p>
          <form noValidate onSubmit={submit} className={styles.ctaForm}>
            <label htmlFor="cta-email" className={styles.srOnly}>
              Work email
            </label>
            <input
              id="cta-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "cta-email-error" : undefined}
              onChange={() => error && setError("")}
            />
            <button type="submit" className={`${styles.btn} ${styles.btnSolid}`}>
              Request a demo
            </button>
          </form>
          <p id="cta-email-error" role={error ? "alert" : undefined} className={styles.ctaError}>
            {error}
          </p>
        </div>
      </div>
    </section>
  );
}
