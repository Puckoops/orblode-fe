import { apiFetch, ORBLODE_API, USERS_API } from "@/lib/api/client";
import { putToSignedUrl } from "@/lib/upload/putToSignedUrl";

// The signed-in person's own account: user-svc keeps it, the BFF's /api/account routes change it and
// the session cookies with it, and orblode-svc holds the avatar image.

const ACCOUNT_API = "/api/account";

export interface Me {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  /** Absent from a user-svc that predates changing a password; read that as having one. */
  has_password?: boolean;
  /** Sign-in providers linked to the account, such as "google"; absent from the same older user-svc. */
  linked_providers?: string[];
  /** Unix seconds; null before the first sign-in user-svc recorded. */
  last_login_at?: number | null;
}

interface AvatarUpload {
  upload_url: string;
  content_type: string;
  avatar_url: string;
}

export function getMe(): Promise<Me> {
  return apiFetch<Me>(USERS_API, "/users/me");
}

/** An empty avatar_url removes the avatar. */
export function updateProfile(change: { name?: string; avatar_url?: string }): Promise<Me> {
  return apiFetch<Me>(ACCOUNT_API, "/profile", { method: "PUT", body: change });
}

/** Ends every other session; this one carries on with the new token the BFF keeps. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch<null>(ACCOUNT_API, "/password", { method: "POST", body: { current_password: currentPassword, new_password: newPassword } });
}

/** For an account made with Google: a link to set a first password, sent to its address. */
export async function requestPasswordLink(email: string): Promise<void> {
  await apiFetch<null>("/api/auth", "/password-reset/request", { method: "POST", body: { email } });
}

/** Stores the image and answers the URL to save as the avatar; nothing changes until it is saved. */
export async function uploadAvatar(file: File): Promise<string> {
  const target = await apiFetch<AvatarUpload>(ORBLODE_API, "/account/avatar", {
    method: "POST",
    body: { content_type: file.type, size_bytes: file.size },
  });
  await putToSignedUrl(target.upload_url, file, target.content_type, () => undefined);
  return target.avatar_url;
}
