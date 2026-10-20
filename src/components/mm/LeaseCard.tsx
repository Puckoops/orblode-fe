"use client";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Button, HelperText, Icon, Select, Skeleton } from "@puckoops/camelot";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { refusalMessage } from "@/lib/api/client";
import {
  getOverview,
  getRegister,
  getSiteLease,
  listAnalyses,
  listSurveyTags,
  sendForVetting,
  siteReviewers,
  tagSurvey,
  type Analysis,
  type LeaseDetail,
  type Overview,
  type RegisterRow,
  type Season,
  type SurveyTag,
} from "@/lib/api/mm";
import type { Survey } from "@/lib/api/orblodeSvc";
import { useMay } from "@/lib/access/sitePermissions";
import { m3, thousands } from "@/lib/mm/format";
import { seasonOf, SEASON_LABEL } from "@/lib/mm/season";
import { toast } from "@/lib/toast";
import { formatSurveyDate } from "@/lib/utils";
import { StudyProgress, studyRunning } from "./AnalysisSummary";
import { LEASE_STATUS, Stages, StatusChip, useSitePermissionsLoad, VERDICT } from "./common";
import { SendForVettingDialog } from "./SendForVettingDialog";
import { StudyInputs } from "./StudyInputs";

const SEASONS_SHOWN = 4;

const today = () => new Date().toISOString().slice(0, 10);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-hairline pt-4">
      <h4 className="caps text-4">{title}</h4>
      {children}
    </section>
  );
}

/** A minor-minerals site's lease in its panel: where the application stands and what comes next, the seasons of its
 * surveys, what its studies measure against, and its latest study. A site without a lease offers to start one. */
export function LeaseCard({ projectId, surveys, className }: { projectId: string; surveys: Survey[]; className?: string }) {
  const router = useRouter();
  const [lease, setLease] = useState<LeaseDetail | null | undefined>(undefined);
  const [row, setRow] = useState<RegisterRow | null>(null);
  const [attention, setAttention] = useState<Overview["attention"]>([]);
  const [tags, setTags] = useState<SurveyTag[]>([]);
  const [latest, setLatest] = useState<Analysis | null>(null);
  const [vetting, setVetting] = useState(false);
  useSitePermissionsLoad(projectId);
  const mayUpload = useMay(projectId, "can_upload");
  const mayRun = useMay(projectId, "can_run_analysis");
  const mayPlan = useMay(projectId, "can_plan_mission");

  const load = useCallback(
    () =>
      getSiteLease(projectId)
        .catch(() => null)
        .then((l) => {
          setLease(l);
          if (!l) return;
          return Promise.all([
            getRegister(projectId).catch(() => [] as RegisterRow[]),
            getOverview().catch(() => null),
            listSurveyTags(projectId).catch(() => [] as SurveyTag[]),
            listAnalyses(l.id).catch(() => [] as Analysis[]),
          ]).then(([rows, overview, t, analyses]) => {
            setRow(rows.find((r) => r.lease.id === l.id) ?? null);
            setAttention(overview?.attention.filter((a) => a.lease_id === l.id) ?? []);
            setTags(t);
            setLatest(analyses[0] ?? null);
          });
        }),
    [projectId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const running = latest !== null && studyRunning(latest);
  useEffect(() => {
    if (!running || !lease) return;
    const t = window.setInterval(() => {
      listAnalyses(lease.id)
        .then((a) => setLatest(a[0] ?? null))
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(t);
  }, [running, lease]);

  if (lease === undefined) return <Skeleton height={120} className={className} />;
  if (lease === null)
    return (
      <div className={`flex flex-col gap-2 rounded-md border border-hairline p-4 ${className ?? ""}`}>
        <h3 className="h3">Lease</h3>
        <HelperText>This site has no lease yet. Its application starts from the lease boundary.</HelperText>
        {mayUpload && (
          <div>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/upload?create=lease&site=${encodeURIComponent(projectId)}`}>Start the application</Link>
            </Button>
          </div>
        )}
      </div>
    );

  const setSeason = async (surveyId: string, season: Season | "") => {
    if (!season) return;
    try {
      await tagSurvey(surveyId, season, "");
      setTags(await listSurveyTags(projectId));
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't set the season."));
    }
  };

  const nextSeason = seasonOf(today()) ?? "post";
  const next = attention[0]
    ? { href: attention[0].link, text: attention[0].item }
    : lease.status === "registered" && mayPlan
      ? { href: `/upload?create=mission&lease=${encodeURIComponent(lease.id)}`, text: `Plan the ${SEASON_LABEL[nextSeason].toLowerCase()} mission` }
      : null;
  const documents = lease.documents?.filter((d) => d.status === "uploaded").length ?? 0;

  return (
    <div className={`flex flex-col gap-4 rounded-md border border-hairline p-4 ${className ?? ""}`}>
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="h3 truncate">{lease.name}</h3>
            {lease.lease_no && <p className="caption text-ink-4">{lease.lease_no}</p>}
          </div>
          <StatusChip map={LEASE_STATUS} value={lease.status} />
        </div>
        {row && (
          <span className="flex items-center gap-2">
            <Stages stages={row.stages} />
            <span className="caption truncate text-ink-3">{row.state_label}</span>
          </span>
        )}
        {next && (
          <Link href={next.href} className="small flex items-center justify-between gap-2 rounded-sm bg-surface-2 px-3 py-2 text-ink-1 hover:bg-surface-3">
            <span>
              <span className="caption block text-ink-4">Next</span>
              {next.text}
            </span>
            <Icon icon={ArrowRight01Icon} size={16} className="shrink-0 text-ink-4" />
          </Link>
        )}
      </div>

      {surveys.length > 0 && (
        <Section title="Seasons">
          <ul className="flex flex-col gap-2">
            {surveys.slice(0, SEASONS_SHOWN).map((s) => {
              const tagged = tags.find((t) => t.survey_id === s.id)?.season;
              const suggested = !tagged ? seasonOf(s.survey_date) : null;
              return (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="num-sm block text-ink-2">{formatSurveyDate(s.survey_date)}</span>
                    {suggested && <span className="caption block text-ink-4">Looks {SEASON_LABEL[suggested].toLowerCase()}</span>}
                  </span>
                  <div className="w-40 shrink-0">
                    <Select
                      aria-label={`Season of ${s.survey_date}`}
                      value={tagged ?? ""}
                      onValueChange={(v) => void setSeason(s.id, v as Season)}
                      allLabel="Not set"
                      options={[
                        { value: "pre", label: SEASON_LABEL.pre },
                        { value: "post", label: SEASON_LABEL.post },
                      ]}
                      disabled={!mayUpload}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="Study inputs">
        <StudyInputs key={lease.id} lease={lease} editable={mayRun} compact onSaved={(l) => setLease({ ...lease, study: l.study })} />
      </Section>

      <Section title="Latest study">
        {!latest ? (
          <HelperText>None yet.</HelperText>
        ) : studyRunning(latest) || latest.status === "failed" ? (
          <StudyProgress a={latest} />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="num text-ink-1">{m3(latest.results.adopted_m3)}</span>
              <StatusChip map={VERDICT} value={latest.verdict} />
            </div>
            <span className="caption text-ink-4">
              {latest.results.adopted_m3 > 0
                ? `Net deposition; the proposed ${thousands(latest.inputs.proposed_m3)} m³/yr is ${latest.rules.ratio_pct.toFixed(0)} % of it`
                : "Nothing was replenished between the two surveys"}
            </span>
            {latest.status === "accepted" ? (
              latest.report_id && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/mm/reports/${latest.report_id}`}>Open report</Link>
                </Button>
              )
            ) : (
              mayRun && (
                <Button variant="primary" size="sm" onClick={() => setVetting(true)}>
                  Send for vetting
                </Button>
              )
            )}
          </div>
        )}
      </Section>

      <div className="flex items-center justify-between gap-2 border-t border-hairline pt-4">
        <span className="caption text-ink-4">
          {documents} {documents === 1 ? "document" : "documents"}
        </span>
        <Button asChild variant="quiet" size="sm">
          <Link href={`/mm/leases/${lease.id}`}>Open lease</Link>
        </Button>
      </div>

      {vetting && latest && (
        <SendForVettingDialog
          reviewers={() => siteReviewers(projectId)}
          send={(steps) => sendForVetting(latest.id, steps)}
          onClose={() => setVetting(false)}
          onDone={(r) => router.push(`/mm/reports/${r.id}`)}
        />
      )}
    </div>
  );
}
