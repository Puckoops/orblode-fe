import "server-only";
import { fromUrl } from "geotiff";
import { sampleSite, type SiteInfo } from "./site";
import { MAX_READ_WIDTH } from "./raster";
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
    return (await siteFromShowcase(body?.data?.surveys ?? [], (path) => hasPreview(`${base}${path}`))) ?? sampleSite();
  } catch (err) {
    console.warn("[landing] showcase unavailable, showing the sample site:", err instanceof Error ? err.message : err);
    return sampleSite();
  }
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
