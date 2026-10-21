import type { ProjectOverview, SiteAlert, SurveyProcessing } from "../api/orblodeSvc.ts";

export type AttentionTone = "bad" | "warn" | "info";

export interface AttentionItem {
  key: string;
  projectId: string;
  tone: AttentionTone;
  text: string;
  href: string;
}

const TONE_ORDER: Record<AttentionTone, number> = { bad: 0, warn: 1, info: 2 };
const SOON_DAYS = 90;
const RECENT_DAYS = 30;
const DORMANT_DAYS = 90;

export type Freshness = "recent" | "due" | "dormant";

/** How current a project's surveying is: within 30 days, due after that, dormant past 90 as the weekly summary has it. */
export function freshnessOf(daysSinceSurvey: number | null): Freshness | null {
  if (daysSinceSurvey === null) return null;
  return daysSinceSurvey <= RECENT_DAYS ? "recent" : daysSinceSurvey <= DORMANT_DAYS ? "due" : "dormant";
}

/** The one date every project's stock is from, or null when they differ or there is none. */
export function stockAsOf(projects: ProjectOverview[]): string | null {
  const dates = new Set(projects.flatMap((p) => (p.stock ? [p.stock.survey.date] : [])));
  return dates.size === 1 ? [...dates][0] : null;
}

const piles = (n: number) => `${n} ${n === 1 ? "stockpile" : "stockpiles"}`;

const dayOf = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** How many projects had a survey within days. */
export function surveyedWithin(projects: ProjectOverview[], days: number): number {
  return projects.filter((p) => p.days_since_survey !== null && p.days_since_survey <= days).length;
}

/** Everything in the workspace that needs someone, worst first: failed processing, red reconciliations and stockpiles
 * whose compute failed, then stockpiles to compute again and stock running out within 90 days of today, then projects
 * gone more than 30 days without a survey. today is YYYY-MM-DD. */
export function attentionItems(input: { failed: SurveyProcessing[]; alerts: SiteAlert[]; projects: ProjectOverview[] }, today: string): AttentionItem[] {
  const site = (id: string) => encodeURIComponent(id);
  const items: AttentionItem[] = [];
  for (const f of input.failed) {
    const text = f.failures.length === 1 ? `${f.failures[0].label} failed to process` : `${f.failures.length} processors failed`;
    items.push({ key: `failed-${f.survey_id}`, projectId: f.project_id, tone: "bad", text, href: `/projects?site=${site(f.project_id)}` });
  }
  for (const a of input.alerts) {
    const names = a.red.map((r) => r.name).join(", ");
    items.push({
      key: `red-${a.project_id}`,
      projectId: a.project_id,
      tone: "bad",
      text: names ? `${names} reconciles red` : "Reconciles red",
      href: `/reports?site=${site(a.project_id)}&tab=reconciliation`,
    });
  }
  for (const p of input.projects) {
    const s = p.stock;
    const inventory = `/reports?site=${site(p.project_id)}&tab=inventory`;
    if (s && s.failed > 0) {
      items.push({ key: `piles-failed-${p.project_id}`, projectId: p.project_id, tone: "bad", text: `${piles(s.failed)} failed to compute`, href: inventory });
    }
    if (s && s.stale + s.uncomputed > 0) {
      const text = s.uncomputed === 0 ? `${piles(s.stale)} changed since computed` : `${piles(s.stale + s.uncomputed)} to compute`;
      items.push({ key: `piles-stale-${p.project_id}`, projectId: p.project_id, tone: "warn", text, href: inventory });
    }
    const d = p.next_depletion;
    if (d && (dayOf(d.date) - dayOf(today)) / 86_400_000 <= SOON_DAYS) {
      items.push({ key: `runs-out-${p.project_id}`, projectId: p.project_id, tone: "warn", text: `${d.material} runs out around ${d.date}`, href: `/reports?site=${site(p.project_id)}&tab=trends` });
    }
    if (p.survey_gap && p.days_since_survey !== null) {
      items.push({ key: `gap-${p.project_id}`, projectId: p.project_id, tone: "info", text: `No survey for ${p.days_since_survey} days`, href: `/projects?site=${site(p.project_id)}` });
    }
  }
  return items.map((item, i) => ({ item, i })).sort((a, b) => TONE_ORDER[a.item.tone] - TONE_ORDER[b.item.tone] || a.i - b.i).map(({ item }) => item);
}
