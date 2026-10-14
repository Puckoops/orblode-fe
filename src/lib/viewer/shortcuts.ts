// The site viewer's keyboard shortcuts: the commands a person can rebind, the keys that stay fixed, and the
// combo strings both are written in ("L", "Shift+G", "Mod+K", "?"). Mod is ⌘ on a Mac and Ctrl elsewhere.

export type ShortcutGroup = "Tools" | "Drawing & editing" | "Lenses" | "Selection" | "Camera" | "Help";

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ["Tools", "Drawing & editing", "Lenses", "Selection", "Camera", "Help"];

export const SHORTCUTS = [
  { id: "tool.point", label: "Point (elevation)", group: "Tools", key: "P" },
  { id: "tool.probe", label: "Probe", group: "Tools", key: "I" },
  { id: "tool.line", label: "Line", group: "Tools", key: "L" },
  { id: "tool.area", label: "Area (polygon)", group: "Tools", key: "A" },
  { id: "tool.section", label: "Cross-section", group: "Tools", key: "X" },
  { id: "tool.grade", label: "Grade", group: "Tools", key: "G" },
  { id: "draw.snap", label: "Snapping on or off", group: "Drawing & editing", key: "S" },
  { id: "lens.ramp", label: "Elevation ramp", group: "Lenses", key: "1" },
  { id: "lens.hillshade", label: "Hillshade", group: "Lenses", key: "2" },
  { id: "lens.contours", label: "Contours, cycling the interval", group: "Lenses", key: "3" },
  { id: "lens.sun", label: "Sun lighting", group: "Lenses", key: "4" },
  { id: "lens.off", label: "All lenses off", group: "Lenses", key: "0" },
  { id: "selection.frame", label: "Frame the selected measurement", group: "Selection", key: "F" },
  { id: "selection.visible", label: "Show or hide the selection", group: "Selection", key: "V" },
  { id: "camera.north", label: "Reset bearing to North", group: "Camera", key: "N" },
  { id: "camera.dimension", label: "2D flat site or 3D site", group: "Camera", key: "O" },
  { id: "camera.grid", label: "Grid, spaced by the zoom", group: "Camera", key: "Shift+G" },
  { id: "help.palette", label: "Command palette", group: "Help", key: "Mod+K" },
  { id: "help.sheet", label: "Keyboard shortcuts", group: "Help", key: "?" },
] as const satisfies readonly { id: string; label: string; group: ShortcutGroup; key: string }[];

export type ShortcutId = (typeof SHORTCUTS)[number]["id"];

/** Keys the drawing and editing handlers own outright. A key listed bare is held with any modifier too. */
export const FIXED_KEYS: readonly { keys: readonly string[]; label: string; group: ShortcutGroup }[] = [
  { keys: ["Escape"], label: "Discard the drawing, back to the cursor", group: "Tools" },
  { keys: ["Enter"], label: "Finish, or edit the selected shape", group: "Drawing & editing" },
  { keys: ["Alt"], label: "Hold to suspend snapping", group: "Drawing & editing" },
  { keys: ["Tab", "ArrowLeft", "ArrowRight"], label: "Walk the vertices while editing", group: "Drawing & editing" },
  { keys: ["Delete", "Backspace"], label: "Remove the selected vertex", group: "Drawing & editing" },
  { keys: ["Mod+A"], label: "Select every vertex while editing", group: "Drawing & editing" },
];

/** A command id to its combo, or to "" when the person took its key away. Only differences from the defaults. */
export type ShortcutOverrides = Partial<Record<ShortcutId, string>>;
export type ShortcutBindings = Record<ShortcutId, string | null>;

const BROWSER_COMBOS = new Set([
  "Mod+C",
  "Mod+V",
  "Mod+X",
  "Mod+Z",
  "Mod+Shift+Z",
  "Mod+Y",
  "Mod+W",
  "Mod+Shift+W",
  "Mod+T",
  "Mod+Shift+T",
  "Mod+N",
  "Mod+Shift+N",
  "Mod+Q",
  "Mod+R",
  "Mod+Shift+R",
  "Mod+L",
  "F5",
  "F11",
  "F12",
]);

const NAMED_KEYS = new Set([
  "Space",
  "Enter",
  "Escape",
  "Tab",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  ...Array.from({ length: 24 }, (_, i) => `F${i + 1}`),
]);

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "OS", "Super", "Hyper", "Fn", "FnLock", "CapsLock", "Dead", "Unidentified", "Process"]);

const LETTER = /^\p{L}$/u;

export interface ParsedCombo {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

/** Shift is part of a letter or named key; a digit or symbol already says which Shift state made it. */
const shiftCounts = (key: string) => key.length > 1 || LETTER.test(key);

function buildCombo({ mod, alt, shift, key }: ParsedCombo): string {
  const k = LETTER.test(key) ? key.toUpperCase() : key;
  return [mod && "Mod", alt && "Alt", shift && shiftCounts(k) && "Shift", k].filter(Boolean).join("+");
}

export function parseCombo(combo: string): ParsedCombo | null {
  let key: string;
  let rest: string;
  if (combo === "+" || combo.endsWith("++")) {
    key = "+";
    rest = combo.slice(0, -2);
  } else {
    const i = combo.lastIndexOf("+");
    key = combo.slice(i + 1);
    rest = i < 0 ? "" : combo.slice(0, i);
  }
  if (!key) return null;
  const mods = rest ? rest.split("+") : [];
  if (mods.some((m) => m !== "Mod" && m !== "Alt" && m !== "Shift") || new Set(mods).size !== mods.length) return null;
  return { mod: mods.includes("Mod"), alt: mods.includes("Alt"), shift: mods.includes("Shift"), key };
}

export function normalizeCombo(combo: string): string | null {
  const parsed = parseCombo(combo);
  return parsed ? buildCombo(parsed) : null;
}

type KeyEventLike = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** The combo a keydown spells, or null while only modifiers are down. */
export function comboFromEvent(e: KeyEventLike): string | null {
  if (!e.key || MODIFIER_KEYS.has(e.key)) return null;
  let key = e.key === " " ? "Space" : e.key;
  // Option turns letters into symbols on a Mac (⌥G is "©"), so the physical key names it instead.
  const physical = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(e.code);
  if (e.altKey && physical && !/^[A-Za-z0-9]$/.test(key)) key = physical[1] ?? physical[2];
  return buildCombo({ mod: e.metaKey || e.ctrlKey, alt: e.altKey, shift: e.shiftKey, key });
}

export function isChord(combo: string): boolean {
  return !!parseCombo(combo)?.mod;
}

const KEY_LABELS: Record<string, string> = {
  Escape: "Esc",
  Delete: "Del",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  PageUp: "Page Up",
  PageDown: "Page Down",
};

/** The keycaps for a combo, in the platform's own names. */
export function comboKeys(combo: string, mac: boolean): string[] {
  const parsed = parseCombo(combo);
  if (!parsed) return [combo];
  const key = parsed.key === "Alt" ? (mac ? "⌥" : "Alt") : (KEY_LABELS[parsed.key] ?? parsed.key);
  return [parsed.mod && (mac ? "⌘" : "Ctrl"), parsed.alt && (mac ? "⌥" : "Alt"), parsed.shift && (mac ? "⇧" : "Shift"), key].filter(
    (k): k is string => !!k,
  );
}

export function comboLabel(combo: string, mac: boolean): string {
  return comboKeys(combo, mac).join(mac ? "" : "+");
}

function fixedOwner(parsed: ParsedCombo, combo: string) {
  return FIXED_KEYS.find((f) =>
    f.keys.some((k) => {
      const fixed = parseCombo(k);
      if (!fixed) return false;
      const bare = !fixed.mod && !fixed.alt && !fixed.shift;
      return bare ? fixed.key === parsed.key : k === combo;
    }),
  );
}

/** Why a combo can't be a shortcut, said to the person, or null when it can. */
export function comboProblem(combo: string, mac: boolean): string | null {
  const parsed = parseCombo(combo);
  if (!parsed || (parsed.key.length > 1 && !NAMED_KEYS.has(parsed.key))) return "That key can't start a shortcut. Use a letter, number, symbol or function key.";
  const label = comboLabel(combo, mac);
  const fixed = fixedOwner(parsed, combo);
  if (fixed) return `${label} is kept for “${fixed.label}”, which can't be changed.`;
  if (parsed.alt) return `${mac ? "⌥" : "Alt"} is held to suspend snapping, so a shortcut can't use it.`;
  if (BROWSER_COMBOS.has(combo)) return `${label} belongs to the browser.`;
  return null;
}

const DEFAULTS = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s.key])) as Record<ShortcutId, string>;

export function defaultCombo(id: ShortcutId): string {
  return DEFAULTS[id];
}

/** Each command's key: overrides claim theirs first, and a default someone else took is left unset. */
export function resolveBindings(overrides: ShortcutOverrides): ShortcutBindings {
  const taken = new Set<string>();
  const bindings = {} as ShortcutBindings;
  const claim = (id: ShortcutId, combo: string) => {
    bindings[id] = combo && !taken.has(combo) ? combo : null;
    if (bindings[id]) taken.add(combo);
  };
  for (const s of SHORTCUTS) if (overrides[s.id] !== undefined) claim(s.id, overrides[s.id]!);
  for (const s of SHORTCUTS) if (overrides[s.id] === undefined) claim(s.id, s.key);
  return bindings;
}

export function commandFor(bindings: ShortcutBindings, combo: string): ShortcutId | null {
  return SHORTCUTS.find((s) => bindings[s.id] === combo)?.id ?? null;
}

/** Gives a command a combo (null takes its key away). Whoever held that combo is left without one. */
export function assignShortcut(overrides: ShortcutOverrides, id: ShortcutId, combo: string | null): ShortcutOverrides {
  const bindings = resolveBindings(overrides);
  const next: ShortcutOverrides = { ...overrides, [id]: combo ?? "" };
  if (combo) for (const s of SHORTCUTS) if (s.id !== id && bindings[s.id] === combo) next[s.id] = "";
  for (const s of SHORTCUTS) if (next[s.id] === s.key) delete next[s.id];
  return next;
}

export function resetShortcut(overrides: ShortcutOverrides, id: ShortcutId): ShortcutOverrides {
  return assignShortcut(overrides, id, DEFAULTS[id]);
}

/** Stored overrides, keeping only known commands with combos that may still be shortcuts. */
export function parseOverrides(raw: string | null | undefined): ShortcutOverrides {
  let value: unknown;
  try {
    value = JSON.parse(raw ?? "{}");
  } catch {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const overrides: ShortcutOverrides = {};
  for (const s of SHORTCUTS) {
    const stored = (value as Record<string, unknown>)[s.id];
    if (stored === "") overrides[s.id] = "";
    else if (typeof stored === "string") {
      const combo = normalizeCombo(stored);
      if (combo && !comboProblem(combo, false) && combo !== s.key) overrides[s.id] = combo;
    }
  }
  return overrides;
}
