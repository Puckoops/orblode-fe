import { useSyncExternalStore } from "react";
import {
  assignShortcut,
  resetShortcut,
  parseOverrides,
  resolveBindings,
  type ShortcutBindings,
  type ShortcutId,
  type ShortcutOverrides,
} from "./shortcuts";

// The person's own keys live in this browser, like its appearance, and every open tab follows a change.
const STORAGE_KEY = "orblode.shortcuts";
const EVENT = "orblode:shortcuts-change";

export interface ShortcutState {
  overrides: ShortcutOverrides;
  bindings: ShortcutBindings;
}

const DEFAULT_STATE: ShortcutState = { overrides: {}, bindings: resolveBindings({}) };

let fallback: string | null = null;
let cached: { raw: string | null; state: ShortcutState } = { raw: null, state: DEFAULT_STATE };

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return fallback;
  }
}

function snapshot(): ShortcutState {
  const raw = readRaw();
  if (raw !== cached.raw) {
    const overrides = parseOverrides(raw);
    cached = { raw, state: { overrides, bindings: resolveBindings(overrides) } };
  }
  return cached.state;
}

function write(overrides: ShortcutOverrides) {
  const raw = Object.keys(overrides).length > 0 ? JSON.stringify(overrides) : null;
  fallback = raw;
  try {
    if (raw === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    /* storage unavailable: the keys still change for this page */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/** The keys in force now, for keydown handlers that run outside React. */
export function currentBindings(): ShortcutBindings {
  return snapshot().bindings;
}

export function useShortcuts(): ShortcutState {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_STATE);
}

export const setShortcut = (id: ShortcutId, combo: string | null) => write(assignShortcut(snapshot().overrides, id, combo));
export const restoreShortcut = (id: ShortcutId) => write(resetShortcut(snapshot().overrides, id));
export const restoreAllShortcuts = () => write({});

const noSubscription = () => () => {};
const onMac = () => /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Whether keys should read ⌘ and ⌥; false on the server so hydration agrees. */
export function useMacKeys(): boolean {
  return useSyncExternalStore(noSubscription, onMac, () => false);
}
