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
