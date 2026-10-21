import { ApiError } from "../api/envelope.ts";

/** Why orblode-svc refused to show a survey: it isn't published yet, or the person has no access to it at all. */
export interface SurveyDenial {
  reason: "unpublished" | "no_access";
  /** The survey's site, when the refusal names it. */
  siteId: string | null;
}

/**
 * Reads a refused survey read. orblode-svc's FGA gate answers 403 "forbidden: requires <relation> on
 * project:<id>", and a survey that isn't published or locked needs can_view_draft. Anything but a 403 is null.
 */
export function surveyDenial(err: unknown): SurveyDenial | null {
  if (!(err instanceof ApiError) || err.status !== 403) return null;
  if (!/\bcan_view_draft\b/.test(err.message)) return { reason: "no_access", siteId: null };
  const site = /\bproject:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i.exec(err.message);
  return { reason: "unpublished", siteId: site?.[1] ?? null };
}

/** The Sites page, opened on a site's surveys when there is one to open. */
export function sitesHref(siteId: string | null): string {
  return siteId ? `/projects?site=${encodeURIComponent(siteId)}` : "/projects";
}
