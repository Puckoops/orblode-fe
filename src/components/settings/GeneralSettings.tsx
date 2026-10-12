"use client";

import { GoogleIcon, ImageUpload01Icon, Logout03Icon } from "@hugeicons/core-free-icons";
import {
  Avatar,
  Band,
  Button,
  Card,
  Chip,
  DescriptionList,
  Field,
  HelperText,
  Icon,
  Input,
  SegmentedControl,
  Skeleton,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useTheme,
  type ThemePreference,
} from "@puckoops/camelot";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { APPEARANCE } from "@/components/shell/UserMenu";
import { useAuthClient, useAuthUser } from "@/hooks/useAuth";
import { AVATAR_TYPES, avatarProblem, nameProblem, passwordProblems, type PasswordChange } from "@/lib/accountRules";
import { changePassword, getMe, requestPasswordLink, updateProfile, uploadAvatar, type Me } from "@/lib/api/account";
import { ApiError } from "@/lib/api/client";
import { signOut } from "@/lib/auth";
import { PASSWORD_HINT } from "@/lib/email";
import { releasePush } from "@/lib/push/client";
import { toast } from "@/lib/toast";

/** The server's own words for a request it refused, or the fallback for anything else. */
function messageOf(err: unknown, fallback: string) {
  return err instanceof ApiError && err.status >= 400 && err.status < 500 && err.message ? err.message : fallback;
}

function Profile({ me, onSaved }: { me: Me; onSaved: (me: Me) => void }) {
  const client = useAuthClient();
  const [name, setName] = useState(me.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    const problem = nameProblem(name);
    setNameError(problem);
    if (problem) return;
    setSavingName(true);
    try {
      onSaved(await updateProfile({ name: name.trim() }));
      toast.success("Name saved.");
    } catch (err) {
      setNameError(messageOf(err, "Couldn't save your name. Try again."));
    } finally {
      setSavingName(false);
    }
  };

  const savePhoto = async (avatarUrl: (() => Promise<string>) | "") => {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      onSaved(await updateProfile({ avatar_url: avatarUrl === "" ? "" : await avatarUrl() }));
      toast.success(avatarUrl === "" ? "Photo removed." : "Photo saved.");
    } catch (err) {
      setPhotoError(messageOf(err, "Couldn't save your photo. Try again."));
    } finally {
      setPhotoBusy(false);
    }
  };

  const pick = (file: File | undefined) => {
    if (picker.current) picker.current.value = "";
    if (!file) return;
    const problem = avatarProblem(file);
    if (problem) setPhotoError(problem);
    else void savePhoto(() => uploadAvatar(file));
  };

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={me.name || me.email} src={me.avatar_url} size={36} />
            <Button variant="ghost" iconStart={ImageUpload01Icon} loading={photoBusy} onClick={() => picker.current?.click()}>
              {me.avatar_url ? "Change photo" : "Upload photo"}
            </Button>
            {me.avatar_url && (
              <Button variant="quiet" disabled={photoBusy} onClick={() => void savePhoto("")}>
                Remove
              </Button>
            )}
            <input ref={picker} type="file" accept={AVATAR_TYPES.join(",")} hidden onChange={(e) => pick(e.target.files?.[0])} />
          </div>
          <HelperText tone={photoError ? "error" : "hint"} role={photoError ? "alert" : undefined}>
            {photoError ?? "PNG, JPEG or WebP, up to 2 MB."}
          </HelperText>
        </div>

        <form className="flex flex-col gap-4 sm:max-w-sm" onSubmit={saveName} noValidate>
          <Field label="Name" error={nameError}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} />
          </Field>
          <div>
            <Button type="submit" variant="primary" loading={savingName} disabled={name.trim() === me.name}>
              Save name
            </Button>
          </div>
        </form>

        <DescriptionList
          items={[
            { label: "Email", value: me.email || "—" },
            { label: "Organisation", value: client?.company_name || client?.name || "—" },
          ]}
        />
      </div>
    </Card>
  );
}

const NO_CHANGE: PasswordChange = { current: "", next: "", confirm: "" };

function Password({ me }: { me: Me }) {
  const [form, setForm] = useState<PasswordChange>(NO_CHANGE);
  const [errors, setErrors] = useState<Partial<Record<keyof PasswordChange, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const set = (key: keyof PasswordChange) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problems = passwordProblems(form);
    setErrors(problems);
    setFailure(null);
    if (Object.keys(problems).length > 0) return;
    setBusy(true);
    try {
      await changePassword(form.current, form.next);
      setForm(NO_CHANGE);
      toast.success("Password changed. You're signed out everywhere else.");
    } catch (err) {
      setFailure(messageOf(err, "Couldn't change your password. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    setBusy(true);
    try {
      await requestPasswordLink(me.email);
      setLinkSent(true);
    } catch (err) {
      toast.error(messageOf(err, "Couldn't send the link. Try again."));
    } finally {
      setBusy(false);
    }
  };

  if (me.has_password === false) {
    const why = me.linked_providers?.includes("google") ? "You sign in with Google, so this account has no password." : "This account has no password.";
    return (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <p className="small text-ink-2">{why} Set one to sign in with your email address too.</p>
          {linkSent ? (
            <HelperText tone="success">We sent a link to {me.email}. It works for an hour.</HelperText>
          ) : (
            <Button variant="ghost" loading={busy} onClick={() => void sendLink()}>
              Email me a link to set one
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-4 sm:max-w-sm">
          <Field label="Current password" error={errors.current}>
            <PasswordInput value={form.current} onChange={set("current")} autoComplete="current-password" />
          </Field>
          <Field label="New password" error={errors.next} hint={PASSWORD_HINT}>
            <PasswordInput value={form.next} onChange={set("next")} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" error={errors.confirm}>
            <PasswordInput value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
          </Field>
        </div>
        {failure && (
          <HelperText tone="error" role="alert">
            {failure}
          </HelperText>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" loading={busy}>
            Change password
          </Button>
          <span className="small text-ink-3">Changing it signs you out on every other device.</span>
        </div>
      </form>
    </Card>
  );
}

function ConnectedAccounts({ email, providers }: { email: string; providers: string[] }) {
  const google = providers.includes("google");
  return (
    <Table minWidth={300} footer={google ? undefined : `Sign in with Google as ${email} to connect it.`}>
      <THead>
        <Tr>
          <Th>Account</Th>
          <Th>Status</Th>
        </Tr>
      </THead>
      <TBody>
        <Tr>
          <Td primary>
            <span className="inline-flex items-center gap-2">
              <Icon icon={GoogleIcon} size={16} />
              Google
            </span>
          </Td>
          <Td>
            {google ? (
              <Chip tone="teal" glyph="check">
                Connected
              </Chip>
            ) : (
              <Chip tone="neutral" glyph="circle-dashed">
                Not connected
              </Chip>
            )}
          </Td>
        </Tr>
      </TBody>
    </Table>
  );
}

/** The person's account (name, photo, password, connected sign-ins), how Orblode looks here and signing out. */
export function GeneralSettings() {
  const router = useRouter();
  const user = useAuthUser();
  const { preference, setPreference } = useTheme();
  const [me, setMe] = useState<Me | null>(null);
  const [settled, setSettled] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    getMe()
      .then(setMe, () => undefined)
      .finally(() => setSettled(true));
  }, []);

  const shown: Me | null = me ?? (user ? { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url } : null);

  const saved = (next: Me) => {
    setMe((current) => ({ ...(current ?? next), name: next.name, avatar_url: next.avatar_url }));
    router.refresh();
  };

  const leave = async () => {
    setLeaving(true);
    await releasePush().catch(() => undefined);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  };

  return (
    <>
      {shown && (
        <>
          <Band first heading="Profile" caption="How people in your organisation see you.">
            <Profile key={me ? "account" : "session"} me={shown} onSaved={saved} />
          </Band>
          <Band heading="Password">{settled ? <Password me={shown} /> : <Skeleton height={148} />}</Band>
          {shown.linked_providers && (
            <Band heading="Connected accounts" caption="Other ways to sign in to this account.">
              <ConnectedAccounts email={shown.email} providers={shown.linked_providers} />
            </Band>
          )}
        </>
      )}
      <Band first={!shown} heading="Appearance" caption="Applies to this browser.">
        <SegmentedControl<ThemePreference> aria-label="Appearance" value={preference} onValueChange={setPreference} options={APPEARANCE} />
      </Band>
      <Band heading="Session">
        <Button iconStart={Logout03Icon} onClick={leave} loading={leaving}>
          Sign out
        </Button>
      </Band>
    </>
  );
}
