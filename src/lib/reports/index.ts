import type {
  InventoryReport,
  Material,
  MaterialTrend,
  ProductionLine,
  ProductionRecord,
  SurveyRef,
} from "../api/orblodeSvc.ts";

const fixed = (digits: number) =>
  new Intl.NumberFormat("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const one = fixed(1);
const whole = fixed(0);
const minus = (s: string) => s.replace(/^-/, "−");

export function formatTonnes(v: number | null | undefined): string {
  return v == null ? "—" : `${minus(one.format(v))} t`;
}

export function formatCubic(v: number | null | undefined): string {
  return v == null ? "—" : `${minus(one.format(v))} m³`;
}

export function formatValue(v: number | null | undefined): string {
  return v == null ? "—" : minus(whole.format(v));
}

export function formatPercent(v: number | null | undefined): string {
  return v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${one.format(Math.abs(v))} %`;
}

/** A change with its sign spelled out, so a fall never reads as a level. */
export function formatDelta(v: number | null | undefined, unit: "t" | "m³"): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${sign}${one.format(Math.abs(v))} ${unit}`;
}

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function inventoryCsv(report: InventoryReport): string {
  const rows: (string | number | undefined)[][] = [
    [
      "pile",
      "pile_id",
      "material",
      "state",
      "volume_m3",
      "adjusted_volume_m3",
      "tonnage_t",
      "value",
      "previous_volume_m3",
      "previous_tonnage_t",
      "delta_volume_m3",
      "delta_tonnage_t",
    ],
  ];
  for (const p of report.piles) {
    rows.push([
      p.name,
      p.pile_id,
      p.material_name,
      p.state,
      p.volume_m3,
      p.adjusted_volume_m3,
      p.tonnage_t,
      p.value,
      p.previous_volume_m3,
      p.previous_tonnage_t,
      p.delta_volume_m3,
      p.delta_tonnage_t,
    ]);
  }
  for (const p of report.removed_piles) {
    rows.push([p.name, p.pile_id, p.material_name, "removed", 0, 0, 0, 0, p.volume_m3, p.tonnage_t, p.delta_volume_m3, p.delta_tonnage_t]);
  }
  return toCsv(rows);
}

/** Splits CSV text into rows of trimmed cells, honouring quoted cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  row.push(cell.trim());
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

export interface ParsedProduction {
  lines: ProductionLine[];
  errors: string[];
}

const MATERIAL_COLUMNS = ["material", "material_id", "material_name"];
const MINED_COLUMNS = ["mined_tonnage_t", "mined_t", "mined"];
const DISPATCHED_COLUMNS = ["dispatched_tonnage_t", "dispatched_t", "dispatched"];

/**
 * Production lines from a CSV with a header row naming the material (by name or id) and the
 * mined and dispatched tonnes, as the legacy import had them. Rows naming the same material add up.
 */
export function parseProductionCsv(text: string, materials: Material[]): ParsedProduction {
  const rows = parseCsv(text);
  if (rows.length === 0) return { lines: [], errors: ["The file is empty."] };
  const header = rows[0].map((h) => h.toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iMaterial = col(MATERIAL_COLUMNS);
  const iMined = col(MINED_COLUMNS);
  const iDispatched = col(DISPATCHED_COLUMNS);
  if (iMaterial < 0 || (iMined < 0 && iDispatched < 0)) {
    return { lines: [], errors: ["The header needs a material column and a mined_tonnage_t or dispatched_tonnage_t column."] };
  }

  const byKey = new Map<string, Material>();
  for (const m of materials) {
    byKey.set(m.id, m);
    byKey.set(m.name.trim().toLowerCase(), m);
  }
  const totals = new Map<string, ProductionLine>();
  const errors: string[] = [];
  const tonnes = (raw: string | undefined, line: number, what: string): number | null => {
    if (raw == null || raw === "") return 0;
    const v = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(v) || v < 0) {
      errors.push(`Row ${line}: ${what} "${raw}" is not a tonnage.`);
      return null;
    }
    return v;
  };
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const key = (r[iMaterial] ?? "").trim();
    const material = byKey.get(key) ?? byKey.get(key.toLowerCase());
    if (!material) {
      errors.push(`Row ${line}: "${key}" is not a material of this site.`);
      return;
    }
    const mined = iMined < 0 ? 0 : tonnes(r[iMined], line, "mined");
    const dispatched = iDispatched < 0 ? 0 : tonnes(r[iDispatched], line, "dispatched");
    if (mined == null || dispatched == null) return;
    const total = totals.get(material.id) ?? { material_id: material.id, mined_t: 0, dispatched_t: 0 };
    total.mined_t += mined;
    total.dispatched_t += dispatched;
    totals.set(material.id, total);
  });
  return { lines: [...totals.values()], errors };
}

export interface ProductionPeriod {
  start: string;
  end: string;
  records: ProductionRecord[];
}

/** Records grouped by their period, newest period first. */
export function productionPeriods(records: ProductionRecord[]): ProductionPeriod[] {
  const periods = new Map<string, ProductionPeriod>();
  for (const r of records) {
    const key = `${r.period_start}/${r.period_end}`;
    const p = periods.get(key) ?? { start: r.period_start, end: r.period_end, records: [] };
    p.records.push(r);
    periods.set(key, p);
  }
  return [...periods.values()].sort((a, b) => b.start.localeCompare(a.start) || b.end.localeCompare(a.end));
}

/** The latest two surveys with stockpiles, oldest first; null when there are fewer than two. */
export function defaultReconciliationPair(surveys: SurveyRef[]): [string, string] | null {
  const sorted = [...surveys].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  return [sorted[sorted.length - 2].id, sorted[sorted.length - 1].id];
}

export interface TrendSeries {
  unit: "t" | "m³";
  data: { label: string; value: number; comparison: number | null }[];
}

/**
 * A material's surveyed stock against its fitted line, in tonnes, or in cubic metres when the
 * material has no density and every tonnage is 0. The fitted line is only drawn in tonnes, since
 * the report fits tonnes.
 */
export function trendSeries(trend: MaterialTrend): TrendSeries {
  const inTonnes = trend.points.some((p) => p.tonnage_t !== 0);
  return {
    unit: inTonnes ? "t" : "m³",
    data: trend.points.map((p) => ({
      label: p.date,
      value: inTonnes ? p.tonnage_t : p.volume_m3,
      comparison: inTonnes && p.fitted_t != null ? p.fitted_t : null,
    })),
  };
}
