"use client";

import {
  Building03Icon,
  Cancel01Icon,
  Link01Icon,
  LockIcon,
  Tick02Icon,
  UnfoldMoreIcon,
  UserGroupIcon,
  UserRemove01Icon,
} from "@hugeicons/core-free-icons";
import { Avatar, Button, HelperText, Icon, Menu, MenuItem, Skeleton, type IconDefinition } from "@puckoops/camelot";
import { useEffect, useState, type ReactNode } from "react";

import { useAuthClient, useAuthUser } from "@/hooks/useAuth";
import { refusalMessage } from "@/lib/api/client";
import { getSurveyAccess, shareSurvey, unshareSurvey, type SurveyAccess } from "@/lib/api/orblodeSvc";
import { getAccess, listOrgMembers, listTeams, type AccessEntry, type OrgMember, type Team } from "@/lib/api/userSvc";
import { describeRoles, parseSubjectKey, type SubjectOption } from "@/lib/access/roles";
import { useSitePermissions } from "@/lib/access/sitePermissions";
import {
  inviteSuggestions,
  ownAccess,
  resolveInvitees,
  shareLink,
  shareOptions,
  shareRows,
  sharedWithEveryone,
  siteAccessDetail,
  siteAccessSummary,
  type ShareRow,
} from "@/lib/access/surveyShare";
import { organisationLabel } from "@/lib/organisation/links";
import { toast } from "@/lib/toast";

const accessButton =
  "caption inline-flex shrink-0 items-center gap-0.5 rounded-xs px-1.5 py-1 text-ink-3 hover:bg-surface-2 hover:text-ink-1 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none";

function Tile({ icon }: { icon: IconDefinition }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-surface-3 text-ink-3">
      <Icon icon={icon} size={16} />
    </span>
  );
}

function Row({ lead, name, detail, access }: { lead: ReactNode; name: ReactNode; detail?: ReactNode; access: ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      {lead}
      <span className="min-w-0 flex-1">
        <span className="small block truncate text-ink-1">{name}</span>
        {detail && <span className="caption block truncate text-ink-4">{detail}</span>}
      </span>
      {access}
    </li>
  );
}

/**
 * Notion's share card for one survey: invite people or teams by name, email or team name, see who it's shared with
 * and who reaches it through the site, set whether everyone in the organisation may view it, and copy its link.
 * Whoever manages access to the survey's site changes it; everyone else sees it.
 */
export function SurveyShareCard({ surveyId, surveyLabel, site }: { surveyId: string; surveyLabel: string; site: { id: string; name: string | null } }) {
  const me = useAuthUser();
  const client = useAuthClient();
  const orgName = client ? organisationLabel(client) : "the organisation";
  const permissions = useSitePermissions((s) => s.bySite[site.id]);
  const [access, setAccess] = useState<SurveyAccess | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [people, setPeople] = useState<OrgMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [siteAccess, setSiteAccess] = useState<AccessEntry[] | null>(null);
  const [siteOpen, setSiteOpen] = useState(false);
  const [picked, setPicked] = useState<SubjectOption[]>([]);
  const [text, setText] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSurveyAccess(surveyId)
      .then((a) => !cancelled && setAccess(a))
      .catch(() => !cancelled && setLoadFailed(true));
    Promise.all([listOrgMembers(), listTeams()])
      .then(([p, t]) => {
        if (cancelled) return;
        setPeople(p);
        setTeams(t);
      })
      .catch((err) => console.error("Failed to fetch people and teams:", err));
    getAccess("project", site.id)
      .then((entries) => !cancelled && setSiteAccess(entries))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [surveyId, site.id]);

  const canManage = access?.can_manage ?? false;
  const entries = access?.entries ?? [];
  const everyone = sharedWithEveryone(entries);
  const rows = shareRows(entries, people, teams).filter((r) => !(r.type === "user" && r.id === me?.id));
  const members = shareOptions([], people, teams).filter((o) => o.value !== `user:${me?.id}`);
  const taken = new Set(entries.map((e) => `${e.subject.type}:${e.subject.id}`));
  const options = members.filter((o) => !taken.has(o.value));
  const suggestions = inviteSuggestions(text, options, picked.map((p) => p.value));
  const siteSummary = siteAccess && siteAccess.length > 0 ? siteAccessSummary(siteAccess) : null;

  const change = async (key: string, run: () => Promise<SurveyAccess>, done: string) => {
    setBusy(key);
    setError(null);
    try {
      setAccess(await run());
      toast.success(done);
    } catch (err) {
      setError(refusalMessage(err, "Sharing couldn't change. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const pick = (option: SubjectOption) => {
    setPicked((list) => (list.some((p) => p.value === option.value) ? list : [...list, option]));
    setText((t) => t.slice(0, Math.max(0, t.lastIndexOf(",") + 1)));
    setHighlight(0);
    setError(null);
  };

  const takeTyped = (): SubjectOption[] | null => {
    const { found, already, unknown } = resolveInvitees(text, members, taken);
    if (unknown.length > 0) {
      setError(`No one in ${orgName} goes by ${unknown.map((u) => `“${u}”`).join(", ")}. Shares stay inside the organisation.`);
      return null;
    }
    if (already.length > 0 && found.length === 0) setError(`${already.map((a) => a.label).join(", ")} can already view it.`);
    const merged = [...picked, ...found.filter((f) => !picked.some((p) => p.value === f.value))];
    setPicked(merged);
    setText("");
    return merged;
  };

  const invite = async () => {
    const invitees = takeTyped();
    if (!invitees || invitees.length === 0) return;
    setBusy("invite");
    setError(null);
    const failed = new Map<string, string>();
    for (const invitee of invitees) {
      try {
        setAccess(await shareSurvey(surveyId, parseSubjectKey(invitee.value)));
      } catch (err) {
        failed.set(invitee.value, `${invitee.label}: ${refusalMessage(err, "couldn't be shared with")}`);
      }
    }
    setBusy(null);
    setPicked(invitees.filter((i) => failed.has(i.value)));
    if (failed.size > 0) setError([...failed.values()].join(" · "));
    const shared = invitees.filter((i) => !failed.has(i.value));
    if (shared.length > 0) toast.success(`Shared with ${shared.length === 1 ? shared[0].label : `${shared.length} people and teams`}`);
  };

  const remove = (row: ShareRow) => void change(row.key, () => unshareSurvey(surveyId, { type: row.type, id: row.id }), `Stopped sharing with ${row.name}`);

  const setEveryone = (on: boolean) => {
    if (!client || on === everyone) return;
    const subject = { type: "organisation" as const, id: client.id };
    void change(
      "organisation",
      () => (on ? shareSurvey(surveyId, subject) : unshareSurvey(surveyId, subject)),
      on ? `Everyone at ${orgName} can view it` : "Only people invited can view it"
    );
  };

  const copy = async () => {
    const link = shareLink(window.location.origin, surveyId, client?.id);
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      window.prompt("Copy this link", link);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && suggestions.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && suggestions.length > 0) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) pick(suggestions[Math.min(highlight, suggestions.length - 1)]);
      else if (text.trim()) takeTyped();
      else void invite();
    } else if (e.key === "Backspace" && !text && picked.length > 0) {
      setPicked((list) => list.slice(0, -1));
    } else if (e.key === "Escape" && suggestions.length > 0) {
      e.stopPropagation();
      setText("");
    }
  };

  const viewMenu = (label: string, onRemove: () => void, key: string) =>
    canManage ? (
      <Menu
        align="end"
        minWidth={180}
        trigger={
          <button type="button" className={accessButton} disabled={busy !== null} aria-label={`${label}, change access`}>
            Can view
            <Icon icon={UnfoldMoreIcon} size={14} />
          </button>
        }
      >
        <MenuItem icon={Tick02Icon}>Can view</MenuItem>
        <MenuItem icon={UserRemove01Icon} onSelect={onRemove} disabled={busy === key}>
          Remove
        </MenuItem>
      </Menu>
    ) : (
      <span className="caption shrink-0 px-1.5 text-ink-3">Can view</span>
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-end gap-4 border-b border-hairline px-4 pt-3">
        <span className="small border-b-2 border-ink-1 pb-2.5 font-medium text-ink-1">Share</span>
        <span className="caption ml-auto min-w-0 truncate pb-2.5 text-ink-4">{surveyLabel}</span>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-4">
        {canManage && (
          <div className="relative flex items-start gap-2">
            <div className="flex min-h-[var(--control-h)] min-w-0 flex-1 flex-wrap items-center gap-1 rounded-sm border border-control bg-surface px-2 py-1 focus-within:border-focus focus-within:ring-2 focus-within:ring-focus">
              {picked.map((p) => (
                <span key={p.value} className="caption inline-flex max-w-full items-center gap-1 rounded-xs bg-surface-3 py-0.5 pr-1 pl-1.5 text-ink-1">
                  <span className="truncate">{p.label}</span>
                  <button
                    type="button"
                    aria-label={`Don't invite ${p.label}`}
                    className="rounded-xs text-ink-4 hover:text-ink-1"
                    onClick={() => setPicked((list) => list.filter((x) => x.value !== p.value))}
                  >
                    <Icon icon={Cancel01Icon} size={12} />
                  </button>
                </span>
              ))}
              <input
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setHighlight(0);
                  setError(null);
                }}
                onKeyDown={onKeyDown}
                role="combobox"
                aria-expanded={suggestions.length > 0}
                aria-controls="share-suggestions"
                aria-autocomplete="list"
                aria-label="Invite people or teams"
                placeholder={picked.length === 0 ? "Email, name or team, separated by commas" : ""}
                className="small h-7 min-w-24 flex-1 bg-transparent text-ink-1 outline-none placeholder:text-ink-4"
              />
            </div>
            <Button variant="primary" loading={busy === "invite"} disabled={busy !== null || (picked.length === 0 && !text.trim())} onClick={() => void invite()}>
              Invite
            </Button>
            {suggestions.length > 0 && (
              <ul
                id="share-suggestions"
                role="listbox"
                aria-label="People and teams"
                className="absolute top-full right-[84px] left-0 z-10 mt-1 flex flex-col rounded-md border border-hairline bg-surface p-1 shadow-[var(--shadow-overlay)]"
              >
                {suggestions.map((s, i) => (
                  <li
                    key={s.value}
                    role="option"
                    aria-selected={i === highlight}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(s)}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 ${i === highlight ? "bg-surface-2" : ""}`}
                  >
                    {s.value.startsWith("team:") ? <Tile icon={UserGroupIcon} /> : <Avatar name={s.label} size={24} />}
                    <span className="min-w-0 flex-1">
                      <span className="small block truncate text-ink-1">{s.label}</span>
                      {s.meta && <span className="caption block truncate text-ink-4">{s.meta}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {loadFailed ? (
          <div className="small rounded-md bg-surface-2 px-3 py-2.5 text-ink-2">Who it&apos;s shared with couldn&apos;t load. Close this and try again.</div>
        ) : (
          access &&
          !canManage && (
            <div className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2.5">
              <span className="small flex-1 text-ink-1">You can only view this survey&apos;s sharing</span>
              <span className="caption shrink-0 text-ink-4">The project&apos;s managers change it</span>
            </div>
          )
        )}

        <ul className="flex flex-col">
          {me && (
            <Row
              lead={<Avatar name={me.name || me.email} src={me.avatar_url} size={32} />}
              name={
                <>
                  {me.name || me.email} <span className="text-ink-4">(You)</span>
                </>
              }
              detail={me.name ? me.email : undefined}
              access={<span className="caption shrink-0 px-1.5 text-ink-3">{ownAccess(permissions)}</span>}
            />
          )}
          {access === null && !loadFailed && (
            <li className="py-1.5">
              <Skeleton height={32} />
            </li>
          )}
          {rows.map((row) => (
            <Row
              key={row.key}
              lead={row.type === "team" ? <Tile icon={UserGroupIcon} /> : <Avatar name={row.name} src={people.find((p) => p.user_id === row.id)?.avatar_url} size={32} />}
              name={row.name}
              detail={row.meta}
              access={viewMenu(row.name, () => remove(row), row.key)}
            />
          ))}
          {siteSummary && (
            <>
              <Row
                lead={<Tile icon={Building03Icon} />}
                name={site.name ?? "The project"}
                detail={siteAccessDetail(siteSummary, orgName)}
                access={
                  <button type="button" className={accessButton} aria-expanded={siteOpen} onClick={() => setSiteOpen((o) => !o)}>
                    {siteSummary.access}
                    <Icon icon={UnfoldMoreIcon} size={14} />
                  </button>
                }
              />
              {siteOpen &&
                siteAccess!.map((entry) => (
                  <li key={`${entry.subject.type}:${entry.subject.id}:${entry.source?.id ?? ""}`} className="flex items-center gap-3 py-1 pl-11">
                    <span className="caption min-w-0 flex-1 truncate text-ink-2">{entry.subject.name || entry.subject.email || "Unknown account"}</span>
                    <span className="caption shrink-0 px-1.5 text-ink-4">{describeRoles(entry.roles, "project") || "Owner or admin"}</span>
                  </li>
                ))}
            </>
          )}
        </ul>

        <section aria-labelledby="share-general" className="flex flex-col">
          <h3 id="share-general" className="caption pb-1 text-ink-4">
            General access
          </h3>
          <ul>
            <Row
              lead={everyone ? <Avatar name={orgName} size={32} square /> : <Tile icon={LockIcon} />}
              name={
                canManage ? (
                  <Menu
                    align="start"
                    minWidth={220}
                    trigger={
                      <button type="button" className="inline-flex items-center gap-1 rounded-xs hover:text-ink-2 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none" disabled={busy !== null}>
                        {everyone ? `Everyone at ${orgName}` : "Only people invited"}
                        <Icon icon={UnfoldMoreIcon} size={14} className="text-ink-4" />
                      </button>
                    }
                  >
                    <MenuItem icon={everyone ? undefined : Tick02Icon} onSelect={() => setEveryone(false)}>
                      Only people invited
                    </MenuItem>
                    <MenuItem icon={everyone ? Tick02Icon : undefined} onSelect={() => setEveryone(true)}>
                      Everyone at {orgName}
                    </MenuItem>
                  </Menu>
                ) : everyone ? (
                  `Everyone at ${orgName}`
                ) : (
                  "Only people invited"
                )
              }
              detail={everyone ? undefined : "and whoever has a role on the project"}
              access={everyone ? <span className="caption shrink-0 px-1.5 text-ink-3">Can view</span> : null}
            />
          </ul>
        </section>

        {error && (
          <HelperText tone="error" role="alert">
            {error}
          </HelperText>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end border-t border-hairline px-4 py-3">
        <Button variant="ghost" iconStart={Link01Icon} onClick={() => void copy()}>
          Copy link
        </Button>
      </div>
    </div>
  );
}
