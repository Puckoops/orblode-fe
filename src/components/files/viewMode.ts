import { useSyncExternalStore } from "react";

export type ViewMode = "grid" | "list";

// One choice for the whole Files page, folders and files alike, kept per browser. The server snapshot
// is grid, so hydration agrees.
const STORAGE_KEY = "orblode:files-view";
const EVENT = "orblode:files-view-change";
/** The last choice storage refused, which wins until the page reloads. */
let unsaved: ViewMode | null = null;

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function read(): ViewMode {
  if (unsaved) return unsaved;
  try {
    return localStorage.getItem(STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function write(next: ViewMode) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
    unsaved = null;
  } catch {
    unsaved = next;
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useViewMode(): [ViewMode, (next: ViewMode) => void] {
  return [useSyncExternalStore(subscribe, read, () => "grid"), write];
}
