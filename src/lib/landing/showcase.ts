import "server-only";
import { fromUrl } from "geotiff";
import type { SiteInfo } from "./site";
import { MAX_READ_WIDTH } from "./raster";
import { displayDate, siteFromShowcase, type ShowcaseEntry } from "./showcaseSite";

/**
 * The survey flagged as the showcase in orblode-svc, for the landing capture. Throws when
 * orblode-svc can't be reached or nothing usable is flagged: a capture of the sample site would
 * silently replace the real one.
 */
export async function showcaseForCapture(): Promise<{ site: SiteInfo; surveyId: string }> {
  const base = process.env.ORBLODE_SVC_URL?.replace(/\/+$/, "");
  if (!base) throw new Error("Set ORBLODE_SVC_URL to orblode-svc's /api/v1 base");
  const res = await fetch(`${base}/showcase`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GET /showcase answered ${res.status}`);
  const entries = ((await res.json()) as { data?: { surveys?: ShowcaseEntry[] } } | null)?.data?.surveys ?? [];
  const site = await siteFromShowcase(entries, (path) => hasPreview(`${base}${path}`));
  if (!site) throw new Error("No flagged survey has a DSM the landing can draw");
  const primary = entries
    .filter((e) => displayDate(e.survey.survey_date) === site.surveyDate)
    .sort((a, b) => a.survey.survey_date.localeCompare(b.survey.survey_date))
    .at(-1);
  if (!primary) throw new Error("The drawn survey isn't among the flagged ones");
  return { site, surveyId: primary.survey.id };
}

/**
 * Whether the DSM at `url` has an image small enough for the browser to read whole, which in
 * practice means overviews. Only the TIFF headers are fetched.
 */
async function hasPreview(url: string) {
  try {
    const tiff = await fromUrl(url, { allowFullFile: false });
    const count = await tiff.getImageCount();
    for (let i = 0; i < count; i++) if ((await tiff.getImage(i)).getWidth() <= MAX_READ_WIDTH) return true;
    console.warn("[landing] the showcase DSM has no overviews to preview from:", url);
    return false;
  } catch (err) {
    console.warn("[landing] the showcase DSM could not be read:", err instanceof Error ? err.message : err);
    return false;
  }
}
