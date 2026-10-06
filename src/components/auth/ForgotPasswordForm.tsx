"use client";

import { Button, Field, Input, TextLink } from "@puckoops/camelot";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { looksLikeEmail, normalizeEmail } from "@/lib/email";
import styles from "./auth.module.css";
import { FormAlert } from "./FormAlert";
import { postJson } from "./post";

export function ForgotPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!looksLikeEmail(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError(undefined);
    setPending(true);
    setError(null);
    const to = normalizeEmail(email);
    const res = await postJson("/api/auth/password-reset/request", { email: to });
    setPending(false);
    if (!res?.ok) {
      setError(res?.message ?? "We couldn't send the link. Try again in a moment.");
      return;
    }
    setSentTo(to);
  };

  const backToSignIn = `/sign-in${sentTo || email ? `?email=${encodeURIComponent(sentTo ?? email.trim())}` : ""}`;

  if (sentTo) {
    return (
      <>
        <h1 className="quote">Check your email</h1>
        <p className={`small ${styles.lede}`}>
          If <strong>{sentTo}</strong> has an Orblode account, a link to choose a new password is on its way. It works once and
          expires in an hour.
        </p>
        <div className={styles.form}>
          <Button asChild variant="ghost" size="lg" className={styles.submit}>
            <Link href={backToSignIn}>Back to sign in</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="quote">Reset your password</h1>
      <p className={`small ${styles.lede}`}>Enter your account&rsquo;s email and we&rsquo;ll send you a link to choose a new password.</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        <FormAlert message={error} />
        <Field label="Email" error={fieldError}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" autoFocus />
        </Field>
        <Button type="submit" variant="primary" size="lg" className={styles.submit} loading={pending}>
          Send reset link
        </Button>
      </form>
      <p className={`small ${styles.alt}`}>
        Remembered it?{" "}
        <TextLink as={Link} href={backToSignIn}>
          Sign in
        </TextLink>
      </p>
    </>
  );
}
