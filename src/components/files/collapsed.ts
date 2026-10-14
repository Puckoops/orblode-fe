import { useSyncExternalStore } from "react";

// The Files cards someone folded away, by card key, kept per browser. Every card starts open, and the
// server snapshot is open too, so hydration agrees.
const STORAGE_KEY = "orblode:files-collapsed";
const EVENT = "orblode:files-collapsed-change";
const LIMIT = 500;
const NONE: ReadonlySet<string> = new Set();

/** The last value storage refused, which wins until the page reloads. */
let unsaved: string | null = null;
let cachedRaw: string | null = null;
let cached: ReadonlySet<string> = NONE;

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function parse(raw: string | null): ReadonlySet<string> {
  try {
    const keys: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(keys) ? new Set(keys.filter((k): k is string => typeof k === "string")) : NONE;
  } catch {
    return NONE;
  }
}

// useSyncExternalStore needs the same set back until storage changes.
function read(): ReadonlySet<string> {
  let raw = unsaved;
  if (raw === null) {
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

function write(next: ReadonlySet<string>) {
  const raw = JSON.stringify([...next].slice(-LIMIT));
  try {
    localStorage.setItem(STORAGE_KEY, raw);
    unsaved = null;
  } catch {
    unsaved = raw;
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Folds or opens these cards together; the most recently folded are kept when the list is trimmed. */
function setCollapsed(keys: string[], collapse: boolean) {
  const next = new Set(read());
  for (const key of keys) {
    next.delete(key);
    if (collapse) next.add(key);
  }
  write(next);
}

export function useCollapsed(): [ReadonlySet<string>, (keys: string[], collapse: boolean) => void] {
  return [useSyncExternalStore(subscribe, read, () => NONE), setCollapsed];
}
