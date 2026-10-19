// How the minor-minerals screens write numbers: a thin space between thousands, as survey reports do.

export function thousands(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "–";
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${value < 0 ? "−" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

export const m3 = (v: number) => `${thousands(v)} m³`;
export const ha = (m2: number) => `${thousands(m2 / 1e4, 2)} ha`;
export const pct = (v: number | undefined | null, decimals = 1) => (v === undefined || v === null || !Number.isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(decimals)} %`);

export function dateOf(ms?: number): string {
  if (!ms) return "–";
  return new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTimeOf(ms?: number): string {
  if (!ms) return "–";
  return new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export const MINERALS: Record<string, string> = {
  river_sand: "River sand",
  building_stone: "Building stone",
  morrum: "Morrum",
  ordinary_earth: "Ordinary earth",
  brick_earth: "Brick earth",
};

export const WORKFLOWS: Record<string, string> = {
  A: "A · Lease survey and certification",
  B: "B · Seasonal replenishment",
  C: "C · Stock verification",
  D: "D · Ordinary earth (linear project)",
};
