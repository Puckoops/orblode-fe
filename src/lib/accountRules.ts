import { PASSWORD_HINT, PASSWORD_RULE } from "./email.ts";

/** What orblode-svc accepts for an avatar. */
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** What's wrong with an image as an avatar, in words for the person; null when it will do. */
export function avatarProblem(file: { type: string; size: number }): string | null {
  if (!AVATAR_TYPES.includes(file.type)) return "Choose a PNG, JPEG or WebP image.";
  if (file.size === 0) return "That image is empty. Choose another.";
  if (file.size > AVATAR_MAX_BYTES) return "Choose an image of 2 MB or less.";
  return null;
}

/** user-svc's limits on a name: 1–100 characters once trimmed. */
export function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter your name.";
  if (trimmed.length > 100) return "Use 100 characters or fewer.";
  return null;
}

export interface PasswordChange {
  current: string;
  next: string;
  confirm: string;
}

export function passwordProblems(change: PasswordChange): Partial<Record<keyof PasswordChange, string>> {
  const problems: Partial<Record<keyof PasswordChange, string>> = {};
  if (!change.current) problems.current = "Enter your current password.";
  if (!PASSWORD_RULE.test(change.next)) problems.next = `Use ${PASSWORD_HINT.replace(/\.$/, "")}.`;
  else if (change.next === change.current) problems.next = "Choose a password you aren't using now.";
  if (!problems.next && change.confirm !== change.next) problems.confirm = "The passwords don't match.";
  return problems;
}
