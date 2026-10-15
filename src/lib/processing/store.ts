import { create } from "zustand";
import {
  getSurveyProcessing,
  listProcessingFailures,
  listRunningSurveys,
  retryProcessing,
  type ProcessingFailure,
  type RunningSurvey,
  type SurveyProcessing,
} from "@/lib/api/orblodeSvc";

interface ProcessingState {
  /** Every survey of the signed-in client whose processing failed. */
  failed: SurveyProcessing[];
  /** Every survey of the signed-in client still processing; none of them opens in the viewer. */
  running: RunningSurvey[];
  /** The survey open in the viewer. */
  current: SurveyProcessing | null;
  refreshFailed: () => Promise<void>;
  refreshRunning: () => Promise<void>;
  loadCurrent: (surveyId: string) => Promise<void>;
  /** Runs each retryable failure again; resolves to how many started. */
  retry: (surveyId: string, failures: ProcessingFailure[]) => Promise<number>;
  /** Reloads what's shown for a survey after its files were sent to processing elsewhere. */
  refreshSurvey: (surveyId: string) => Promise<void>;
}

export const useProcessing = create<ProcessingState>((set, get) => ({
  failed: [],
  running: [],
  current: null,

  refreshFailed: async () => {
    try {
      set({ failed: await listProcessingFailures() });
    } catch {
      // Keep what was shown; the next survey notice or reload tries again.
    }
  },

  refreshRunning: async () => {
    try {
      set({ running: await listRunningSurveys() });
    } catch {
      // Keep what was shown; the viewer still checks the survey itself before it opens.
    }
  },

  loadCurrent: async (surveyId) => {
    try {
      const current = await getSurveyProcessing(surveyId);
      set({ current });
    } catch {
      if (get().current?.survey_id !== surveyId) set({ current: null });
    }
  },

  retry: async (surveyId, failures) => {
    const results = await Promise.allSettled(failures.filter((f) => f.retryable).map((f) => retryProcessing(surveyId, f.workflow_id)));
    await get().refreshSurvey(surveyId);
    return results.filter((r) => r.status === "fulfilled").length;
  },

  refreshSurvey: async (surveyId) => {
    await Promise.all([
      get().refreshFailed(),
      get().refreshRunning(),
      get().current?.survey_id === surveyId ? get().loadCurrent(surveyId) : Promise.resolve(),
    ]);
  },
}));

/** Whether the survey is still processing, so it doesn't open in the viewer yet. */
export function useSurveyProcessing(surveyId: string | null | undefined): boolean {
  return useProcessing((s) => !!surveyId && s.running.some((r) => r.survey_id === surveyId));
}
