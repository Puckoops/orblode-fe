"use client";

import { Button, Checkbox, Field, GoogleSignIn, Input, TextLink, toast } from "@puckoops/camelot";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { login, loginWithGoogle } from "@/lib/api/userSvc";
import { looksLikeEmail, normalizeEmail } from "@/lib/email";
import styles from "./auth.module.css";
import { FormAlert } from "./FormAlert";
import { PasswordInput } from "./PasswordInput";
import { postJson, safeNextPath } from "./post";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const carry = next !== "/globe" ? next : undefined;
  const nextQuery = carry ? `?next=${encodeURIComponent(carry)}` : "";
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const resend = async (to: string) => {
    setPending(true);
    const res = await postJson("/api/auth/resend", { email: to, next: carry });
    setPending(false);
    if (res?.ok) setResent(true);
    else setError("We couldn't send a new link. Try again in a moment.");
  };

  const signInWithGoogle = async (credential: string) => {
    setPending(true);
    setError(null);
    setUnconfirmed(null);
    setResent(false);
    try {
      await loginWithGoogle(credential, remember);
      toast.success("Signed in");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "That didn't work. Try again.");
      setPending(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!looksLikeEmail(email)) errs.email = "Enter a valid email address.";
    if (password.length < 8) errs.password = "Passwords are at least 8 characters.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setPending(true);
    setError(null);
    setUnconfirmed(null);
    setResent(false);
    try {
      await login(normalizeEmail(email), password, remember);
      toast.success("Signed in");
      router.push(next);
      router.refresh();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 403) setUnconfirmed(normalizeEmail(email));
      setError(err instanceof Error && err.message ? err.message : "That didn't work. Try again.");
      setPending(false);
    }
  };

  return (
    <>
      <h1 className="quote">Sign in to Orblode</h1>
      <p className={`small ${styles.lede}`}>Welcome back. Enter your credentials to continue.</p>
      {GOOGLE_CLIENT_ID && (
        <div className={styles.sso}>
          <GoogleSignIn clientId={GOOGLE_CLIENT_ID} onCredential={signInWithGoogle} />
          <p className={`small ${styles.or}`}>or with your email</p>
        </div>
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <FormAlert message={error} />
        {unconfirmed && (
          <p className={`small ${styles.notice}`}>
            {resent ? (
              <>A new link is on its way to {unconfirmed}.</>
            ) : (
              <>
                Didn&rsquo;t get the link?{" "}
                <button type="button" className={styles.inlineAction} disabled={pending} onClick={() => resend(unconfirmed)}>
                  Send a new one
                </button>
              </>
            )}
          </p>
        )}
        <Field label="Email" error={fieldErrors.email}>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            autoFocus
          />
        </Field>
        <Field label="Password" error={fieldErrors.password}>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
          />
        </Field>
        <div className={styles.options}>
          <Checkbox label="Remember me" checked={remember} onCheckedChange={setRemember} />
          <TextLink as={Link} href={`/forgot-password${email ? `?email=${encodeURIComponent(email.trim())}` : ""}`} className="small">
            Forgot password?
          </TextLink>
        </div>
        <Button type="submit" variant="primary" size="lg" className={styles.submit} loading={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className={`small ${styles.alt}`}>
        New to Orblode? <TextLink as={Link} href={`/sign-up${nextQuery}`}>Create an organisation</TextLink>
      </p>
    </>
  );
}
