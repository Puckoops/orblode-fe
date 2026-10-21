"use client";

import { Button, Field, Input, TextLink, toast } from "@puckoops/camelot";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { loginWithGoogle } from "@/lib/api/userSvc";
import { looksLikeEmail, normalizeEmail, PASSWORD_HINT, PASSWORD_RULE } from "@/lib/email";
import styles from "./auth.module.css";
import { FormAlert } from "./FormAlert";
import { GoogleButton } from "./GoogleButton";
import { PasswordInput } from "./PasswordInput";
import { googleSignUpPath, postJson, safeNextPath } from "./post";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

const EMPTY = {
  name: "",
  email: "",
  password: "",
  company_name: "",
  company_role: "",
  domain: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  country: "",
};

type Form = typeof EMPTY;

const REQUIRED: Record<Exclude<keyof Form, "email" | "password">, string> = {
  name: "Enter your name.",
  company_name: "Enter your organisation's name.",
  company_role: "Enter your role there.",
  domain: "Enter your organisation's web domain.",
  phone: "Enter a phone number.",
  address: "Enter the street address.",
  city: "Enter the city.",
  state: "Enter the state or region.",
  zip: "Enter the postcode.",
  country: "Enter the country code, such as AU.",
};

interface SignUpFormProps {
  /** The person Google vouched for at sign-in, who signs up without a password and is signed in at once. */
  google?: { name: string; email: string } | null;
  googleExpired?: boolean;
}

/**
 * Creates an organisation with the person as its owner. With a password it ends at the inbox, like every Puckoops
 * sign-up; through Google it ends signed in.
 */
export function SignUpForm({ google, googleExpired }: SignUpFormProps) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const carry = next !== "/overview" ? next : undefined;
  const nextQuery = carry ? `?next=${encodeURIComponent(carry)}` : "";
  const [form, setForm] = useState<Form>({ ...EMPTY, name: google?.name ?? "", email: google?.email ?? params.get("email") ?? "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [error, setError] = useState<string | null>(googleExpired ? "Your Google sign-in has expired. Continue with Google again." : null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const set = (key: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Partial<Record<keyof Form, string>> = {};
    for (const [key, message] of Object.entries(REQUIRED) as [keyof typeof REQUIRED, string][]) {
      if (!form[key].trim()) errs[key] = message;
    }
    if (!google) {
      if (!looksLikeEmail(form.email)) errs.email = "Enter a valid email address.";
      if (!PASSWORD_RULE.test(form.password)) errs.password = `Use ${PASSWORD_HINT.replace(/\.$/, "")}.`;
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setPending(true);
    setError(null);
    if (google) {
      const res = await postJson("/api/auth/google/sign-up", form);
      if (!res?.ok) {
        setError(res?.message ?? "That didn't work. Try again.");
        setPending(false);
        return;
      }
      toast.success("Organisation created");
      router.push(next);
      router.refresh();
      return;
    }
    const res = await postJson("/api/auth/signup", { ...form, email: normalizeEmail(form.email), next: carry });
    setPending(false);
    if (!res?.ok) {
      setError(res?.message ?? "That didn't work. Try again.");
      return;
    }
    setSentTo(normalizeEmail(form.email));
  };

  const continueWithGoogle = async (code: string) => {
    setPending(true);
    setError(null);
    try {
      const result = await loginWithGoogle(code);
      if ("needs_organisation" in result) {
        router.replace(googleSignUpPath(carry));
        setPending(false);
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

  const resend = async () => {
    if (!sentTo) return;
    setPending(true);
    const res = await postJson("/api/auth/resend", { email: sentTo, next: carry });
    setPending(false);
    if (res?.ok) setResent(true);
    else setError("We couldn't send a new link. Try again in a moment.");
  };

  if (sentTo) {
    return (
      <>
        <h1 className="quote">Check your email</h1>
        <p className={`small ${styles.lede}`}>
          Your organisation is ready. If <strong>{sentTo}</strong> is new to Puckoops, we sent it a link: open it to confirm the
          address, then sign in. If you already had an account, sign in with it now.
        </p>
        <div className={styles.form}>
          <FormAlert message={error} />
          <Button variant="ghost" size="lg" className={styles.submit} loading={pending} disabled={resent} onClick={resend}>
            {resent ? "Link sent again" : "Send the link again"}
          </Button>
        </div>
        <p className={`small ${styles.alt}`}>
          Confirmed already?{" "}
          <TextLink as={Link} href={`/sign-in${nextQuery}`}>
            Sign in
          </TextLink>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="quote">Create your organisation</h1>
      <p className={`small ${styles.lede}`}>Set up Orblode for your company. You become its owner and can invite your team.</p>
      {GOOGLE_CLIENT_ID && !google && (
        <div className={styles.sso}>
          <GoogleButton clientId={GOOGLE_CLIENT_ID} onCode={continueWithGoogle} onError={setError} disabled={pending} label="Continue with Google" />
          <p className={`small ${styles.or}`}>or with your email</p>
        </div>
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <FormAlert message={error} />
        <div className={styles.row}>
          <Field label="Your name" error={fieldErrors.name}>
            <Input value={form.name} onChange={set("name")} autoComplete="name" autoFocus />
          </Field>
          <Field label="Your role" error={fieldErrors.company_role}>
            <Input value={form.company_role} onChange={set("company_role")} autoComplete="organization-title" placeholder="Survey manager" />
          </Field>
        </div>
        {google ? (
          <Field
            label="Work email"
            hint="Your Google account. You sign in with Google, so there is no password to choose."
            aside={
              <TextLink as={Link} href={`/sign-up${nextQuery}`} className="small">
                Use a password instead
              </TextLink>
            }
          >
            <Input value={google.email} type="email" readOnly className={styles.locked} />
          </Field>
        ) : (
          <>
            <Field label="Work email" error={fieldErrors.email}>
              <Input value={form.email} onChange={set("email")} type="email" autoComplete="email" placeholder="you@company.com" />
            </Field>
            <Field label="Password" error={fieldErrors.password} hint={PASSWORD_HINT}>
              <PasswordInput value={form.password} onChange={set("password")} autoComplete="new-password" />
            </Field>
          </>
        )}
        <div className={styles.row}>
          <Field label="Organisation" error={fieldErrors.company_name}>
            <Input value={form.company_name} onChange={set("company_name")} autoComplete="organization" />
          </Field>
          <Field label="Web domain" error={fieldErrors.domain}>
            <Input value={form.domain} onChange={set("domain")} placeholder="company.com" autoComplete="url" />
          </Field>
        </div>
        <Field label="Phone" error={fieldErrors.phone}>
          <Input value={form.phone} onChange={set("phone")} type="tel" autoComplete="tel" />
        </Field>
        <Field label="Street address" error={fieldErrors.address}>
          <Input value={form.address} onChange={set("address")} autoComplete="street-address" />
        </Field>
        <div className={styles.row}>
          <Field label="City" error={fieldErrors.city}>
            <Input value={form.city} onChange={set("city")} autoComplete="address-level2" />
          </Field>
          <Field label="State or region" error={fieldErrors.state}>
            <Input value={form.state} onChange={set("state")} autoComplete="address-level1" />
          </Field>
        </div>
        <div className={styles.row}>
          <Field label="Postcode" error={fieldErrors.zip}>
            <Input value={form.zip} onChange={set("zip")} autoComplete="postal-code" />
          </Field>
          <Field label="Country code" error={fieldErrors.country}>
            <Input value={form.country} onChange={set("country")} autoComplete="country" placeholder="AU" maxLength={10} />
          </Field>
        </div>
        <Button type="submit" variant="primary" size="lg" className={styles.submit} loading={pending}>
          Create organisation
        </Button>
      </form>
      <p className={`small ${styles.alt}`}>
        Already have a Puckoops account?{" "}
        <TextLink as={Link} href={`/sign-in${nextQuery}`}>
          Sign in
        </TextLink>
      </p>
    </>
  );
}
