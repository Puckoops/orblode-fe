import { toast as camelotToast } from "@puckoops/camelot";

// GEOID's four toast kinds on Camelot's three tones. A warning here always means "that couldn't
// be done", so it takes the failure tone. A mutable object, so tests can intercept a kind.
export const toast = {
  success: (message: string) => camelotToast.success(message),
  error: (message: string) => camelotToast.error(message),
  info: (message: string) => camelotToast(message),
  warning: (message: string) => camelotToast.error(message),
};
