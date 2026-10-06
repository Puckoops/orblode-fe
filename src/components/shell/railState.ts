import { useSyncExternalStore } from "react";

// The rail's expanded/collapsed choice survives route-group remounts (globe ⇄ viewer) and stays in
// sync between rail instances in a tab. The server snapshot is collapsed, so hydration agrees.
const STORAGE_KEY = "orblode:nav-expanded";
const EVENT = "orblode:nav-expanded-change";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function write(next: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable: the toggle still applies to this page */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useRailExpanded(): [boolean, () => void] {
  const expanded = useSyncExternalStore(subscribe, read, () => false);
  return [expanded, () => write(!expanded)];
}
