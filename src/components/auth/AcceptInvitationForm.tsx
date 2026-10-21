"use client";

import { Button, Field, Input, Skeleton } from "@puckoops/camelot";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { OrgRole } from "@/lib/api/userSvc";
import { orgRoleLabel } from "@/lib/access/roles";
import { PASSWORD_HINT, PASSWORD_RULE } from "@/lib/email";
import styles from "./auth.module.css";
import { FormAlert } from "./FormAlert";
import { PasswordInput } from "./PasswordInput";
import { postJson } from "./post";

interface Preview {
  email: string;
  organisation: string;
  inviter_name?: string;
  role: OrgRole;
}

type Loaded = { state: "ready"; preview: Preview } | { state: "gone"; message: string };

function Unusable({ message }: { message: string }) {
  return (
    <>
      <h1 className="quote">This link didn&rsquo;t work</h1>
      <p className={`small ${styles.lede}`}>{message}</p>
      <div className={styles.form}>
        <Button asChild variant="ghost" size="lg" className={styles.submit}>
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    </>
  );
}

const withArticle = (label: string) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label.toLowerCase()}`;

/** Where an invitation's link lands: the person sets their name and password, joins and is signed in. */
export function AcceptInvitationForm() {
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/invitation?token=${encodeURIComponent(token)}`, { credentials: "same-origin" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { data?: Preview; message?: string } | null;
        setLoaded(res.ok && json?.data ? { state: "ready", preview: json.data } : { state: "gone", message: json?.message ?? "This invitation couldn’t be opened. Try the link again." });
      })
      .catch(() => setLoaded({ state: "gone", message: "We couldn’t reach Orblode. Check your connection and try the link again." }));
  }, [token]);

  if (!token) return <Unusable message="The invitation link is missing its code. Open it from the email again." />;
  if (!loaded) return <Skeleton height={240} />;
  if (loaded.state === "gone") return <Unusable message={loaded.message} />;
  const { preview } = loaded;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: { name?: string; password?: string } = {};
    if (!name.trim()) errs.name = "Tell us your name.";
    if (!PASSWORD_RULE.test(password)) errs.password = `Use ${PASSWORD_HINT.replace(/\.$/, "")}.`;
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setPending(true);
    setError(null);
    const res = await postJson("/api/auth/invitation", { token, name: name.trim(), password });
    if (!res?.ok) {
      setPending(false);
      setError(res?.message ?? "We couldn’t set up your account. Try again in a moment.");
      return;
    }
    router.push("/overview");
    router.refresh();
  };

  const from = preview.inviter_name ? `${preview.inviter_name} invited you` : "You’re invited";
  return (
    <>
      <h1 className="quote">Join {preview.organisation}</h1>
      <p className={`small ${styles.lede}`}>
        {from} to Orblode as {withArticle(orgRoleLabel(preview.role))}. Set up your account to join.
      </p>
      <form className={styles.form} onSubmit={submit} noValidate>
        <FormAlert message={error} />
        <Field label="Email" hint="The address the invitation was sent to.">
          <Input type="email" value={preview.email} readOnly disabled />
        </Field>
        <Field label="Your name" error={fieldErrors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" autoFocus />
        </Field>
        <Field label="Password" error={fieldErrors.password} hint={PASSWORD_HINT}>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button type="submit" variant="primary" size="lg" className={styles.submit} loading={pending}>
          Join {preview.organisation}
        </Button>
      </form>
    </>
  );
}
