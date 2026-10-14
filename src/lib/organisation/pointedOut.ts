const POINTED_OUT_KEY = "orblode.organisations.pointed-out";

/** Organisations this browser has already told the person they were added to. */
export function pointedOut(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(POINTED_OUT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function markPointedOut(ids: string[]) {
  const seen = pointedOut();
  const fresh = ids.filter((id) => !seen.includes(id));
  if (fresh.length === 0) return;
  try {
    localStorage.setItem(POINTED_OUT_KEY, JSON.stringify([...seen, ...fresh]));
  } catch {}
}
