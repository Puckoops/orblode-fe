import "server-only";
import { sampleSite, type SiteInfo } from "./site";
import { siteFromShowcase, type ShowcaseEntry } from "./showcaseSite";

/** How long a rendered landing page keeps the showcase before asking orblode-svc again. */
export const SHOWCASE_REVALIDATE_SECONDS = 300;

/**
 * The site the landing page shows: the survey flagged as the showcase in orblode-svc, or the
 * invented sample quarry when nothing usable is flagged or orblode-svc can't be reached.
 */
export async function landingSite(): Promise<SiteInfo> {
  const base = process.env.ORBLODE_SVC_URL?.replace(/\/+$/, "");
  if (!base) return sampleSite();
  try {
    const res = await fetch(`${base}/showcase`, { next: { revalidate: SHOWCASE_REVALIDATE_SECONDS }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return sampleSite();
    const body = (await res.json()) as { data?: { surveys?: ShowcaseEntry[] } } | null;
    return (await siteFromShowcase(body?.data?.surveys ?? [])) ?? sampleSite();
  } catch (err) {
    console.warn("[landing] showcase unavailable, showing the sample site:", err instanceof Error ? err.message : err);
    return sampleSite();
  }
}
