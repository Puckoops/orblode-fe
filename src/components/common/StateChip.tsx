import { Chip } from "@puckoops/camelot";
import type { StateStyle } from "@/lib/status";

export function StateChip({ state, className }: { state: StateStyle; className?: string }) {
  return (
    <Chip tone={state.tone} glyph={state.glyph} className={className}>
      {state.label}
    </Chip>
  );
}
