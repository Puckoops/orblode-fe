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

const dayOf = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** How many projects had a survey within days. */
export function surveyedWithin(projects: ProjectOverview[], days: number): number {
  return projects.filter((p) => p.days_since_survey !== null && p.days_since_survey <= days).length;
}

/** Everything in the workspace that needs someone, worst first: failed processing and red reconciliations, then stock
 * running out within 90 days of today, then projects gone more than 30 days without a survey. today is YYYY-MM-DD. */
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
