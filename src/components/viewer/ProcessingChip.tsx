import { Tooltip } from "@puckoops/camelot";
import { StateChip } from "@/components/common/StateChip";
import { PROCESSING } from "@/lib/status";

/** Stands in for a survey's "Open in viewer" while it processes. */
export function ProcessingChip() {
  return (
    <Tooltip content="Opens in the viewer once processing finishes">
      <span tabIndex={0} className="inline-flex">
        <StateChip state={PROCESSING} />
      </span>
    </Tooltip>
  );
}
