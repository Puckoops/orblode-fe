import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignShortcut,
  comboFromEvent,
  comboKeys,
  comboLabel,
  comboProblem,
  commandFor,
  normalizeCombo,
  parseOverrides,
  resetShortcut,
  resolveBindings,
  SHORTCUTS,
} from "../shortcuts.ts";

const press = (key: string, mods: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean; code?: string } = {}) =>
  comboFromEvent({ key, code: mods.code ?? "", metaKey: !!mods.meta, ctrlKey: !!mods.ctrl, altKey: !!mods.alt, shiftKey: !!mods.shift });

test("every default key is a valid, distinct shortcut", () => {
  const keys = SHORTCUTS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const s of SHORTCUTS) {
    assert.equal(normalizeCombo(s.key), s.key, s.id);
    assert.equal(comboProblem(s.key, false), null, s.id);
  }
});

test("comboFromEvent spells letters upper-case and keeps Shift only where it changes the key", () => {
  assert.equal(press("l"), "L");
  assert.equal(press("G", { shift: true }), "Shift+G");
  assert.equal(press("?", { shift: true }), "?");
  assert.equal(press("1", { shift: true }), "1");
  assert.equal(press("Tab", { shift: true }), "Shift+Tab");
  assert.equal(press(" "), "Space");
  assert.equal(press("k", { meta: true }), "Mod+K");
  assert.equal(press("k", { ctrl: true, shift: true }), "Mod+Shift+K");
});

test("comboFromEvent waits while only modifiers are down", () => {
  for (const key of ["Shift", "Meta", "Control", "Alt", "Dead"]) assert.equal(press(key), null);
});

test("comboFromEvent names the physical key when Option turns a letter into a symbol", () => {
  assert.equal(press("©", { alt: true, code: "KeyG" }), "Alt+G");
  assert.equal(press("¡", { alt: true, code: "Digit1" }), "Alt+1");
});

test("normalizeCombo orders modifiers and handles the plus key", () => {
  assert.equal(normalizeCombo("Shift+Mod+k"), "Mod+Shift+K");
  assert.equal(normalizeCombo("+"), "+");
  assert.equal(normalizeCombo("Mod++"), "Mod++");
  assert.equal(normalizeCombo("Shift+?"), "?");
  assert.equal(normalizeCombo("Hyper+K"), null);
  assert.equal(normalizeCombo("Mod+Mod+K"), null);
  assert.equal(normalizeCombo(""), null);
});

test("comboKeys and comboLabel use each platform's names", () => {
  assert.deepEqual(comboKeys("Mod+Shift+K", true), ["⌘", "⇧", "K"]);
  assert.deepEqual(comboKeys("Mod+Shift+K", false), ["Ctrl", "Shift", "K"]);
  assert.equal(comboLabel("Shift+G", true), "⇧G");
  assert.equal(comboLabel("Shift+G", false), "Shift+G");
  assert.deepEqual(comboKeys("Escape", false), ["Esc"]);
});

test("comboProblem refuses fixed keys, Alt and browser chords", () => {
  assert.match(comboProblem("Escape", false)!, /Discard the drawing/);
  assert.match(comboProblem("Shift+Tab", false)!, /Walk the vertices/);
  assert.match(comboProblem("Mod+Backspace", true)!, /Remove the selected vertex/);
  assert.match(comboProblem("Mod+A", true)!, /^⌘A is kept for/);
  assert.match(comboProblem("Alt+G", false)!, /suspend snapping/);
  assert.equal(comboProblem("Mod+W", false), "Ctrl+W belongs to the browser.");
  assert.match(comboProblem("MediaPlayPause", false)!, /can't start a shortcut/);
  assert.equal(comboProblem("Shift+A", false), null);
  assert.equal(comboProblem("F2", false), null);
  assert.equal(comboProblem("Mod+Shift+P", false), null);
});

test("resolveBindings lets an override take a default key and leaves its owner unset", () => {
  const bindings = resolveBindings({ "tool.probe": "L" });
  assert.equal(bindings["tool.probe"], "L");
  assert.equal(bindings["tool.line"], null);
  assert.equal(bindings["tool.point"], "P");
  assert.equal(commandFor(bindings, "L"), "tool.probe");
  assert.equal(commandFor(bindings, "I"), null);
});

test("resolveBindings keeps the first of two overrides that share a combo", () => {
  const bindings = resolveBindings({ "tool.line": "Q", "tool.area": "Q" });
  assert.equal(bindings["tool.line"], "Q");
  assert.equal(bindings["tool.area"], null);
});

test("assignShortcut takes the combo from whoever held it and drops overrides equal to defaults", () => {
  const swapped = assignShortcut({}, "tool.line", "G");
  assert.deepEqual(swapped, { "tool.line": "G", "tool.grade": "" });

  const back = assignShortcut(swapped, "tool.grade", "G");
  assert.deepEqual(back, { "tool.line": "" });
  assert.equal(resolveBindings(back)["tool.grade"], "G");

  assert.deepEqual(assignShortcut({}, "lens.off", null), { "lens.off": "" });
});

test("resetShortcut gives a command its default back even when someone else took it", () => {
  const overrides = assignShortcut({}, "tool.probe", "L");
  const reset = resetShortcut(overrides, "tool.line");
  assert.deepEqual(reset, { "tool.probe": "" });
  assert.equal(resolveBindings(reset)["tool.line"], "L");
});

test("parseOverrides keeps known commands with usable combos", () => {
  const raw = JSON.stringify({
    "tool.line": "Shift+Mod+l",
    "tool.area": "",
    "tool.grade": "Escape",
    "lens.ramp": "Alt+1",
    "lens.sun": 4,
    "camera.north": "N",
    nonsense: "Q",
  });
  assert.deepEqual(parseOverrides(raw), { "tool.line": "Mod+Shift+L", "tool.area": "" });
  for (const bad of [null, undefined, "", "{", "[]", "null", '"L"']) assert.deepEqual(parseOverrides(bad), {});
});
