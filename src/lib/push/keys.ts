/** A VAPID public key (base64url, as orblode-svc serves it) as PushManager.subscribe wants it. */
export function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Whether a subscription was made with this key; one made with an older key no longer receives pushes. */
export function sameKey(subscribedWith: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
  if (!subscribedWith) return false;
  const a = new Uint8Array(subscribedWith);
  return a.length === key.length && a.every((byte, i) => byte === key[i]);
}

export type PushOfferChoice = "accepted" | "dismissed";

/** The offer after a first dispatch is made once per browser, whatever the answer. */
export function shouldOffer(supported: boolean, permission: NotificationPermission | null, choice: string | null): boolean {
  return supported && permission === "default" && choice === null;
}
