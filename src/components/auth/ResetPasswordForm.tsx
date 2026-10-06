"use client";

import { Button, Field, TextLink } from "@puckoops/camelot";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PASSWORD_HINT, PASSWORD_RULE } from "@/lib/email";
import styles from "./auth.module.css";
import { FormAlert } from "./FormAlert";
import { PasswordInput } from "./PasswordInput";
import { postJson } from "./post";

export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <>
        <h1 className="quote">This link didn&rsquo;t work</h1>
        <p className={`small ${styles.lede}`}>The reset link is missing its code. Open it from the email again, or ask for a new one.</p>
        <div className={styles.form}>
          <Button asChild variant="ghost" size="lg" className={styles.submit}>
            <Link href="/forgot-password">Send a new link</Link>
          </Button>
        </div>
      </>
    );
  }

  if (done) {
    return (
      <>
        <h1 className="quote">Password changed</h1>
        <p className={`small ${styles.lede}`}>Sign in with your new password.</p>
        <div className={styles.form}>
          <Button asChild variant="primary" size="lg" className={styles.submit}>
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: { password?: string; confirm?: string } = {};
    if (!PASSWORD_RULE.test(password)) errs.password = `Use ${PASSWORD_HINT.replace(/\.$/, "")}.`;
    if (confirm !== password) errs.confirm = "The two passwords don't match.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    setError(null);
    const res = await postJson("/api/auth/password-reset/confirm", { token, new_password: password });
    setPending(false);
    if (!res?.ok) {
      setError(res?.message ?? "We couldn't change your password. Try again in a moment.");
      return;
    }
    setDone(true);
  };

  return (
    <>
      <h1 className="quote">Choose a new password</h1>
      <p className={`small ${styles.lede}`}>It replaces your old one everywhere you use your Puckoops account.</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        <FormAlert message={error} />
        <Field label="New password" error={fieldErrors.password} hint={PASSWORD_HINT}>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
        </Field>
        <Field label="Repeat it" error={fieldErrors.confirm}>
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button type="submit" variant="primary" size="lg" className={styles.submit} loading={pending}>
          Change password
        </Button>
      </form>
      <p className={`small ${styles.alt}`}>
        <TextLink as={Link} href="/forgot-password">
          Send a new link instead
        </TextLink>
      </p>
    </>
  );
}
