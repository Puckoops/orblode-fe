import type { ReactNode } from "react";
import { comboKeys } from "@/lib/viewer/shortcuts";

export function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="num-sm inline-block rounded-xs border border-b-2 border-hairline-strong bg-surface-3 px-1.5 py-0.5 font-medium text-ink-1">
      {children}
    </kbd>
  );
}

/** The keycaps of one or more combos, or a dash for a command with no key. */
export function Keys({ combos, mac }: { combos: readonly string[]; mac: boolean }) {
  if (combos.length === 0) return <span className="small text-ink-4">—</span>;
  return <>{combos.flatMap((combo) => comboKeys(combo, mac).map((k, i) => <Key key={`${combo}-${i}`}>{k}</Key>))}</>;
}
