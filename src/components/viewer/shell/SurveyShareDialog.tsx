"use client";

import { Building03Icon, Cancel01Icon, Link01Icon, LockIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { Avatar, Button, Dialog, HelperText, Icon, IconButton, SearchSelect, Select, Skeleton } from "@puckoops/camelot";
import { useEffect, useState } from "react";

import { useAuthUser } from "@/hooks/useAuth";
import { refusalMessage } from "@/lib/api/client";
import { getSurveyAccess, shareSurvey, unshareSurvey, type SurveyAccess } from "@/lib/api/orblodeSvc";
import { getAccess, listOrgMembers, listTeams, type AccessEntry, type OrgMember, type Team } from "@/lib/api/userSvc";
import { describeRoles, parseSubjectKey } from "@/lib/access/roles";
import { shareLink, shareOptions, shareRows, sharedWithEveryone, type ShareRow } from "@/lib/access/surveyShare";
import { organisationLabel } from "@/lib/organisation/links";
import { useOrganisation } from "@/lib/organisation/store";
import { toast } from "@/lib/toast";

const ONLY_INVITED = "invited";
const EVERYONE = "organisation";

/**
 * Shares one survey to view, the way Notion shares a page: with people or teams in the organisation, or with everyone
 * in it, and with a link to copy. Whoever manages access to the survey's site changes it; everyone else sees it.
 */
export function SurveyShareDialog({
  surveyId,
  surveyLabel,
  site,
  onClose,
}: {
  surveyId: string;
  surveyLabel: string;
  site: { id: string; name: string | null };
  onClose: () => void;
}) {
  const me = useAuthUser();
  const organisation = useOrganisation((s) => s.organisation);
  const orgName = organisation ? organisationLabel(organisation) : "the organisation";
  const [access, setAccess] = useState<SurveyAccess | null>(null);
  const [people, setPeople] = useState<OrgMember[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [siteAccess, setSiteAccess] = useState<AccessEntry[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

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
  const rows = shareRows(entries, people, teams);

  const change = async (key: string, run: () => Promise<SurveyAccess>, done: string) => {
    setBusy(key);
    setError(null);
    try {
      setAccess(await run());
      toast.success(done);
      return true;
    } catch (err) {
      setError(refusalMessage(err, "Sharing couldn't change. Try again."));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const invite = async () => {
    if (!picked) return;
    const subject = parseSubjectKey(picked);
    const named = shareOptions(entries, people, teams).find((o) => o.value === picked)?.label ?? "them";
    if (await change("invite", () => shareSurvey(surveyId, subject), `Shared with ${named}`)) setPicked(null);
  };

  const remove = (row: ShareRow) => void change(row.key, () => unshareSurvey(surveyId, { type: row.type, id: row.id }), `Stopped sharing with ${row.name}`);

  const setGeneral = (value: string) => {
    if (!organisation || (value === EVERYONE) === everyone) return;
    const subject = { type: "organisation" as const, id: organisation.id };
    void change(
      EVERYONE,
      () => (value === EVERYONE ? shareSurvey(surveyId, subject) : unshareSurvey(surveyId, subject)),
      value === EVERYONE ? `Everyone in ${orgName} can view it` : "Only people with access can view it"
    );
  };

  const copy = async () => {
    const link = shareLink(window.location.origin, surveyId, organisation?.id);
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      window.prompt("Copy this link", link);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Share survey"
      description={`${surveyLabel}${site.name ? ` · ${site.name}` : ""}. Shared people can view it, not change it.`}
      width={560}
      footer={
        <>
          <Button variant="ghost" iconStart={Link01Icon} onClick={() => void copy()} className="mr-auto">
            Copy link
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {canManage && (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <SearchSelect
                value={picked}
                onValueChange={setPicked}
                placeholder="Add people or teams"
                searchPlaceholder="Find a person or team"
                options={shareOptions(entries, people, teams)}
                empty={(query) => (query ? `Nobody matches “${query}”.` : "It's shared with every person and team already.")}
              />
            </div>
            <Button variant="primary" disabled={!picked || busy !== null} loading={busy === "invite"} onClick={() => void invite()}>
              Invite
            </Button>
          </div>
        )}

        <section aria-labelledby="share-general" className="flex flex-col gap-2">
          <h3 id="share-general" className="caps text-ink-4">
            General access
          </h3>
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink-3">
              <Icon icon={everyone ? Building03Icon : LockIcon} size={16} />
            </span>
            <div className="min-w-0 flex-1">
              {access === null ? (
                loadFailed ? (
                  <p className="small text-ink-3">Who it&apos;s shared with couldn&apos;t load. Close this and try again.</p>
                ) : (
                  <Skeleton height={32} />
                )
              ) : canManage ? (
                <Select
                  aria-label="General access"
                  value={everyone ? EVERYONE : ONLY_INVITED}
                  disabled={busy !== null || !organisation}
                  onValueChange={setGeneral}
                  options={[
                    { value: ONLY_INVITED, label: "Only people with access" },
                    { value: EVERYONE, label: `Everyone in ${orgName}` },
                  ]}
                />
              ) : (
                <p className="small text-ink-1">{everyone ? `Everyone in ${orgName}` : "Only people with access"}</p>
              )}
              {access && (
                <p className="caption mt-1 text-ink-4">
                  {everyone
                    ? `Anyone in ${orgName} with the link can view it.`
                    : "The people and teams below, and whoever has a role on the site, can open it."}
                </p>
              )}
            </div>
            {!loadFailed && <span className="caption shrink-0 text-ink-3">Can view</span>}
          </div>
        </section>

        {!loadFailed && (
          <section aria-labelledby="share-people" className="flex flex-col gap-2">
            <h3 id="share-people" className="caps text-ink-4">
              Shared with
            </h3>
            {access === null ? (
              <Skeleton height={40} />
            ) : rows.length === 0 ? (
              <p className="caption text-ink-4">{everyone ? "Everyone in the organisation, and nobody on their own." : "Nobody on their own yet."}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {rows.map((row) => (
                  <li key={row.key} className="flex items-center gap-3 rounded-sm py-1">
                    {row.type === "team" ? (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink-3">
                        <Icon icon={UserGroupIcon} size={16} />
                      </span>
                    ) : (
                      <Avatar name={row.name} size={32} src={people.find((p) => p.user_id === row.id)?.avatar_url} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="small block truncate text-ink-1">
                        {row.name}
                        {row.type === "user" && row.id === me?.id && <span className="text-ink-4"> (you)</span>}
                      </span>
                      {row.meta && <span className="caption block truncate text-ink-4">{row.meta}</span>}
                    </span>
                    <span className="caption shrink-0 text-ink-3">Can view</span>
                    {canManage && (
                      <IconButton
                        icon={Cancel01Icon}
                        aria-label={`Stop sharing with ${row.name}`}
                        variant="bare"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() => remove(row)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {siteAccess && siteAccess.length > 0 && (
          <section aria-labelledby="share-site" className="flex flex-col gap-2">
            <h3 id="share-site" className="caps text-ink-4">
              Through {site.name ?? "the site"}
            </h3>
            <ul className="flex flex-col gap-1">
              {siteAccess.map((entry) => (
                <li key={`${entry.subject.type}:${entry.subject.id}:${entry.source?.id ?? ""}`} className="flex items-center gap-3 py-0.5">
                  <span className="small min-w-0 flex-1 truncate text-ink-2">{entry.subject.name || entry.subject.email || "Unknown account"}</span>
                  <span className="caption shrink-0 text-ink-4">{describeRoles(entry.roles, "project") || "Owner or admin"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {access && !canManage && (
          <HelperText>Only the site&apos;s project managers and client admins change who it&apos;s shared with.</HelperText>
        )}
        {error && (
          <HelperText tone="error" role="alert">
            {error}
          </HelperText>
        )}
      </div>
    </Dialog>
  );
}
