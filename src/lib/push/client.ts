import { getPushConfig, removePushSubscription, savePushSubscription, type PushConfig } from "@/lib/api/notifications";
import { applicationServerKey, sameKey, shouldOffer, type PushOfferChoice } from "./keys";

// Browser push for Orblode: the service worker (public/orblode-sw.js) shows what orblode-svc
// pushes. A browser serves one person: it remembers who turned push on, and never hands its
// subscription to someone else who signs in.

const WORKER = "/orblode-sw.js";
const OWNER_KEY = "orblode.push.owner";
const OFFER_KEY = "orblode.push.offer";

/**
 * on: this browser gets this person's pushes. off: it could. blocked: the browser was told no.
 * unsupported: no push in this browser. unavailable: push isn't set up on the server.
 */
export type PushState = "unsupported" | "unavailable" | "blocked" | "off" | "on";

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Without storage the browser forgets who turned push on, and the next sync leaves it off.
  }
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

let config: Promise<PushConfig> | null = null;

function serverConfig(): Promise<PushConfig> {
  config ??= getPushConfig().catch((err) => {
    config = null;
    throw err;
  });
  return config;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function pushState(userId: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const { available, public_key } = await serverConfig();
  if (!available || !public_key) return "unavailable";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted" || stored(OWNER_KEY) !== userId) return "off";
  const subscription = await currentSubscription();
  return subscription && sameKey(subscription.options.applicationServerKey, applicationServerKey(public_key)) ? "on" : "off";
}

/** Asks the browser if it hasn't been asked, then pushes this person's notices in this client here. */
export async function turnOnPush(userId: string): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const { available, public_key } = await serverConfig();
  if (!available || !public_key) return "unavailable";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";
  const registration = await navigator.serviceWorker.register(WORKER, { scope: "/", updateViaCache: "none" });
  const key = applicationServerKey(public_key);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await savePushSubscription(subscription.toJSON());
  store(OWNER_KEY, userId);
  return "on";
}

/** Stops pushes to this browser for everyone. */
export async function turnOffPush(): Promise<void> {
  if (!pushSupported()) return;
  const subscription = await currentSubscription();
  if (subscription) {
    await removePushSubscription(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  }
  store(OWNER_KEY, null);
}

/**
 * On each load: the person who turned push on here sends the subscription again, which adds this
 * client and renews one made with an old key. Anyone else finds push off.
 */
export async function syncPush(userId: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted" || !(await currentSubscription())) return;
  if (stored(OWNER_KEY) !== userId) {
    await turnOffPush();
    return;
  }
  await turnOnPush(userId);
}

/**
 * On sign-out, while the session still works: the leaving person's notices stop coming here. The
 * subscription stays, so the same person signing in again has push back; anyone else finds it off.
 */
export async function releasePush(): Promise<void> {
  if (!pushSupported()) return;
  const subscription = await currentSubscription();
  if (subscription) await removePushSubscription(subscription.endpoint);
}

export function shouldOfferPush(): boolean {
  return shouldOffer(pushSupported(), pushSupported() ? Notification.permission : null, stored(OFFER_KEY));
}

export function rememberPushOffer(choice: PushOfferChoice) {
  store(OFFER_KEY, choice);
}
