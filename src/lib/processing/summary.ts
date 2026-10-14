import type { SurveyProcessing } from "../api/orblodeSvc.ts";

/** Nothing is running and something failed: the survey is not still processing, it stopped. */
export function isStalled(processing: SurveyProcessing | null | undefined): boolean {
  return !!processing && processing.open === 0 && processing.failures.length > 0;
}

export function failedInProject(failed: SurveyProcessing[], projectId: string): SurveyProcessing[] {
  return failed.filter((s) => s.project_id === projectId);
}

/** One line per failure, naming the processor only when there is more than one. */
export function failureLines(processing: SurveyProcessing): string[] {
  const many = processing.failures.length > 1;
  return processing.failures.map((f) => (many ? `${f.label}: ${f.reason}` : f.reason));
}

export function failureTitle(processing: SurveyProcessing): string {
  const n = processing.failures.length;
  return n === 1 ? `${processing.failures[0].label} failed to process` : `${n} processors failed`;
}

const objectKey = (url: string) => url.replace(/^gs:\/\//, "").replace(/^https:\/\/storage\.googleapis\.com\//, "");

/** Why each of the survey's files failed, by asset id: a partial run's files with their own reasons, else every file a
 * failed run read. Files the survey no longer has are left out. */
export function failuresByAsset(
  processing: SurveyProcessing | null | undefined,
  assets: readonly { id: string; url: string }[]
): ReadonlyMap<string, string[]> {
  const ids = new Set(assets.map((a) => a.id));
  const byKey = new Map(assets.map((a) => [objectKey(a.url), a.id]));
  const out = new Map<string, string[]>();
  const add = (assetId: string | undefined, source: string, line: string) => {
    const id = assetId && ids.has(assetId) ? assetId : byKey.get(objectKey(source));
    if (id) out.set(id, [...(out.get(id) ?? []), line]);
  };
  for (const f of processing?.failures ?? []) {
    if (f.files?.length) for (const file of f.files) add(file.asset_id, file.source, `${f.label} couldn't read it: ${file.reason}`);
    else for (const input of f.inputs ?? []) add(input.asset_id, input.source, `${f.label} failed: ${f.reason}`);
  }
  return out;
}

/** Why Retry leaves each of the other failures out, naming the processor only when there are several. */
export function notRetryableLines(processing: SurveyProcessing): string[] {
  const many = processing.failures.length > 1;
  return processing.failures
    .filter((f) => !f.retryable)
    .map((f) => {
      const why = f.inputs_changed
        ? "a file it read has changed since; reprocess it in Edit survey → Files"
        : f.partial
          ? "fix or replace the files it couldn't read, then reprocess them in Edit survey → Files"
          : "upload its file again to process it";
      return many ? `${f.label}: ${why}.` : `${why[0].toUpperCase()}${why.slice(1)}.`;
    });
}
