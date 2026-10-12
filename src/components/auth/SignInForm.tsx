"use client";

import { Button, Checkbox, Field, Input, TextLink, toast } from "@puckoops/camelot";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { login, loginWithGoogle } from "@/lib/api/userSvc";
import { looksLikeEmail, normalizeEmail } from "@/lib/email";
import styles from "./auth.module.css";
import { FormAlert } from "./FormAlert";
import { GoogleButton } from "./GoogleButton";
import { PasswordInput } from "./PasswordInput";
import { googleSignUpPath, postJson, safeNextPath } from "./post";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const carry = next !== "/globe" ? next : undefined;
  const nextQuery = carry ? `?next=${encodeURIComponent(carry)}` : "";
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [step, setStep] = useState<"email" | "password">(() => (looksLikeEmail(email) ? "password" : "email"));
  const emailRef = useRef<HTMLInputElement>(null);
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

  const clearNotices = () => {
    setError(null);
    setUnconfirmed(null);
    setResent(false);
  };

  const editEmail = () => {
    setStep("email");
    setPassword("");
    setFieldErrors({});
    clearNotices();
    emailRef.current?.focus();
  };

  const signInWithGoogle = async (code: string) => {
    setPending(true);
    clearNotices();
    try {
      const result = await loginWithGoogle(code, remember);
      if ("needs_organisation" in result) {
        router.push(googleSignUpPath(carry));
        return;
      }
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
    if (step === "email") {
      if (!looksLikeEmail(email)) {
        setFieldErrors({ email: "Enter a valid email address." });
        return;
      }
      setFieldErrors({});
      setStep("password");
      return;
    }
    if (password.length < 8) {
      setFieldErrors({ password: "Passwords are at least 8 characters." });
      return;
    }
    setFieldErrors({});

    setPending(true);
    clearNotices();
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
      <p className={`small ${styles.lede}`}>Welcome back. Enter your {step} to continue.</p>
      {GOOGLE_CLIENT_ID && (
        <div className={styles.sso}>
          <GoogleButton clientId={GOOGLE_CLIENT_ID} onCode={signInWithGoogle} onError={setError} disabled={pending} />
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
        <Field
          label="Email"
          error={fieldErrors.email}
          aside={
            step === "password" && (
              <span className="small">
                <button type="button" className={styles.inlineAction} disabled={pending} onClick={editEmail}>
                  Change
                </button>
              </span>
            )
          }
        >
          <Input
            ref={emailRef}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@company.com"
            autoComplete="username"
            readOnly={step === "password"}
            className={styles.locked}
            autoFocus={step === "email"}
          />
        </Field>
        {step === "password" && (
          <div className={styles.reveal}>
            <Field
              label="Password"
              error={fieldErrors.password}
              aside={
                <TextLink as={Link} href={`/forgot-password?email=${encodeURIComponent(email.trim())}`} className="small">
                  Forgot password?
                </TextLink>
              }
            >
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                autoFocus
              />
            </Field>
          </div>
        )}
        <div className={styles.options}>
          <Checkbox label="Remember me" checked={remember} onCheckedChange={setRemember} />
        </div>
        <Button type="submit" variant="primary" size="lg" className={styles.submit} loading={pending}>
          {step === "email" ? "Continue" : pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className={`small ${styles.alt}`}>
        New to Orblode? <TextLink as={Link} href={`/sign-up${nextQuery}`}>Create an organisation</TextLink>
      </p>
    </>
  );
}
