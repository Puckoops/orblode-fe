"use client";

import { PencilEdit02Icon, Undo02Icon } from "@hugeicons/core-free-icons";
import { Band, Button, HelperText, Icon, Table, TBody, Td, TGroup, Th, THead, Tr } from "@puckoops/camelot";
import { Fragment, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Keys } from "@/components/common/Keycaps";
import { restoreAllShortcuts, restoreShortcut, setShortcut, useMacKeys, useShortcuts } from "@/lib/viewer/shortcutPrefs";
import {
  comboFromEvent,
  comboLabel,
  comboProblem,
  commandFor,
  defaultCombo,
  FIXED_KEYS,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type ShortcutBindings,
  type ShortcutId,
} from "@/lib/viewer/shortcuts";
import { toast } from "@/lib/toast";

const labelOf = (id: ShortcutId) => SHORTCUTS.find((s) => s.id === id)!.label;

const announceMove = (combo: string, to: ShortcutId, from: ShortcutId, mac: boolean) =>
  toast.info(`${comboLabel(combo, mac)} now runs ${labelOf(to)}. ${labelOf(from)} has no key.`);

/** Listens for the next key and makes it the command's, asking first when another command already has it. */
function Recorder({ id, bindings, mac, onDone }: { id: ShortcutId; bindings: ShortcutBindings; mac: boolean; onDone: (refocus: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [clash, setClash] = useState<{ combo: string; owner: ShortcutId } | null>(null);

  useEffect(() => box.current?.focus(), []);

  const save = (combo: string, owner: ShortcutId | null) => {
    setShortcut(id, combo);
    if (owner) announceMove(combo, id, owner, mac);
    onDone(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    const bare = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    if (e.key === "Escape" && bare) return onDone(true);
    if (e.key === "Enter" && bare && clash) return save(clash.combo, clash.owner);
    if ((e.key === "Backspace" || e.key === "Delete") && bare) {
      setShortcut(id, null);
      return onDone(true);
    }
    const combo = comboFromEvent(e.nativeEvent);
    if (!combo) return;
    const why = comboProblem(combo, mac);
    setProblem(why);
    setClash(null);
    if (why) return;
    const owner = commandFor(bindings, combo);
    if (owner === id) onDone(true);
    else if (owner) setClash({ combo, owner });
    else save(combo, null);
  };

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget)) onDone(false);
  };

  const hint = clash
    ? `${comboLabel(clash.combo, mac)} runs “${labelOf(clash.owner)}”. Press Enter to move it here, or another key.`
    : "Press the new key. Esc cancels, Backspace leaves it without one.";

  return (
    <div className="flex flex-col items-start gap-2" onBlur={onBlur} onKeyDown={(e) => e.key === "Escape" && onDone(true)}>
      <div
        ref={box}
        tabIndex={0}
        role="textbox"
        aria-label={`New key for ${labelOf(id)}`}
        aria-describedby={`shortcut-hint-${id}`}
        onKeyDown={onKeyDown}
        className="flex min-h-8 min-w-[140px] items-center gap-1 rounded-md border border-focus bg-surface-2 px-2 py-1 outline-none ring-2 ring-focus"
      >
        {clash ? <Keys combos={[clash.combo]} mac={mac} /> : <span className="small animate-pulse text-ink-3">Press a key…</span>}
      </div>
      <HelperText id={`shortcut-hint-${id}`} tone={problem ? "error" : "hint"} role={problem ? "alert" : "status"} className="max-w-[300px]">
        {problem ?? hint}
      </HelperText>
      {clash && (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onMouseDown={(e) => e.preventDefault()} onClick={() => save(clash.combo, clash.owner)}>
            Move it here
          </Button>
          <Button size="sm" variant="quiet" onMouseDown={(e) => e.preventDefault()} onClick={() => onDone(true)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function ShortcutRow({
  id,
  label,
  bindings,
  mac,
  recording,
  onRecord,
}: {
  id: ShortcutId;
  label: string;
  bindings: ShortcutBindings;
  mac: boolean;
  recording: boolean;
  onRecord: (on: boolean) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const combo = bindings[id];
  const fallback = defaultCombo(id);

  const reset = () => {
    const owner = commandFor(bindings, fallback);
    restoreShortcut(id);
    trigger.current?.focus();
    if (owner && owner !== id) announceMove(fallback, id, owner, mac);
  };

  useEffect(() => {
    if (!recording && refocus.current) {
      refocus.current = false;
      trigger.current?.focus();
    }
  }, [recording]);

  return (
    <Tr>
      <Td primary>{label}</Td>
      <Td>
        {recording ? (
          <Recorder
            id={id}
            bindings={bindings}
            mac={mac}
            onDone={(back) => {
              refocus.current = back;
              onRecord(false);
            }}
          />
        ) : (
          <button
            ref={trigger}
            type="button"
            onClick={() => onRecord(true)}
            aria-label={`Change the key for ${label}, now ${combo ? comboLabel(combo, mac) : "not set"}`}
            className="group -mx-1.5 inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          >
            {combo ? <Keys combos={[combo]} mac={mac} /> : <span className="small text-ink-4">Not set</span>}
            <Icon icon={PencilEdit02Icon} size={14} className="ml-1 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        )}
      </Td>
      <Td className="text-right">
        {combo !== fallback && (
          <Button size="sm" variant="quiet" onClick={reset} aria-label={`Reset ${label} to ${comboLabel(fallback, mac)}`}>
            Reset to {comboLabel(fallback, mac)}
          </Button>
        )}
      </Td>
    </Tr>
  );
}

/** The site viewer's keys, each changeable in this browser, beside the drawing keys that stay fixed. */
export function ShortcutSettings() {
  const { overrides, bindings } = useShortcuts();
  const mac = useMacKeys();
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const customised = Object.keys(overrides).length > 0;
  const sheetKey = bindings["help.sheet"];
  const footer = `Fixed keys draw and edit shapes, so they stay as they are.${sheetKey ? ` Press ${comboLabel(sheetKey, mac)} in the viewer to see every key.` : ""}`;

  const resetAll = () => {
    restoreAllShortcuts();
    toast.success("Keyboard shortcuts are back to their defaults.");
  };

  return (
    <Band
      first
      heading="Keyboard shortcuts"
      caption="The keys the site viewer answers to. Pick a key to change it. Applies to this browser."
      actions={
        <Button variant="ghost" size="sm" iconStart={Undo02Icon} disabled={!customised} onClick={resetAll}>
          Reset all
        </Button>
      }
    >
      <Table minWidth={300} footer={footer}>
        <THead>
          <Tr>
            <Th>Action</Th>
            <Th className="sm:w-[300px]">Key</Th>
            <Th className="sm:w-36">
              <span className="visually-hidden">Reset</span>
            </Th>
          </Tr>
        </THead>
        <TBody>
          {SHORTCUT_GROUPS.map((group) => (
            <Fragment key={group}>
              <TGroup colSpan={3}>{group}</TGroup>
              {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                <ShortcutRow
                  key={s.id}
                  id={s.id}
                  label={s.label}
                  bindings={bindings}
                  mac={mac}
                  recording={recording === s.id}
                  onRecord={(on) => setRecording((current) => (on ? s.id : current === s.id ? null : current))}
                />
              ))}
              {FIXED_KEYS.filter((f) => f.group === group).map((f) => (
                <Tr key={f.label}>
                  <Td primary>{f.label}</Td>
                  <Td>
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <Keys combos={f.keys} mac={mac} />
                    </span>
                  </Td>
                  <Td className="text-right">
                    <span className="caption text-ink-4">Fixed</span>
                  </Td>
                </Tr>
              ))}
            </Fragment>
          ))}
        </TBody>
      </Table>
    </Band>
  );
}
