"use client";

import { Button, SearchSelect, Select, Table, TBody, Td, Th, THead, Tr } from "@puckoops/camelot";
import { StateChip } from "@/components/common/StateChip";
import { NEEDS_CRS, READING_FILE, crsSourceState } from "@/lib/status";
import { VDATUM_OPTIONS, withCurrent } from "@/lib/upload/options";
import { ROLE_LABELS, type FileRole } from "@/lib/upload/planner";
import { crsChoices, type ReviewRow, type RowEdit } from "@/lib/upload/review";

function crsChip(row: ReviewRow, timedOut: boolean) {
  if (row.inspecting && row.crsSource !== "you") return timedOut ? { ...READING_FILE, label: "Still reading the file" } : READING_FILE;
  if (row.crsSource) return crsSourceState(row.crsSource, row.asset.detection?.crs?.confidence);
  return row.skipReason === null && !row.crs ? NEEDS_CRS : null;
}

/** Each uploaded file as the server read it: what it is, its CRS and vertical datum, each changeable before it is
 * processed; a file still being read can be read again. */
export function ReviewTable({
  rows,
  roles,
  timedOut,
  processing,
  redetecting,
  onEdit,
  onDetectAgain,
}: {
  rows: ReviewRow[];
  roles: FileRole[];
  timedOut: boolean;
  processing: boolean;
  redetecting: ReadonlySet<string>;
  onEdit: (assetId: string, change: RowEdit) => void;
  onDetectAgain: (assetId: string) => void;
}) {
  return (
    <Table minWidth={760}>
      <THead>
        <Tr>
          <Th>File</Th>
          <Th>Role</Th>
          <Th>CRS</Th>
          <Th>Vertical datum</Th>
        </Tr>
      </THead>
      <TBody>
        {rows.map((row) => {
          const chip = crsChip(row, timedOut);
          const offerAgain = row.detectAgain || (timedOut && row.inspecting);
          const notes = [...(row.skipReason ? [row.skipReason] : []), ...row.notes];
          return (
            <Tr key={row.assetId}>
              <Td primary>
                <span className="block max-w-64 truncate" title={row.name}>
                  {row.name}
                </span>
                {row.asset.detection?.format && (
                  <span className="caption block text-ink-4">
                    {row.asset.detection.format}
                    {row.asset.detection.inspected_member ? ` → ${row.asset.detection.inspected_member}` : ""}
                  </span>
                )}
                {notes.map((n) => (
                  <span key={n} className="caption mt-1 block max-w-72 text-ink-2">
                    {n}
                  </span>
                ))}
                {offerAgain && (
                  <Button className="mt-1" size="sm" variant="ghost" loading={redetecting.has(row.assetId)} disabled={processing} onClick={() => onDetectAgain(row.assetId)}>
                    Detect again
                  </Button>
                )}
              </Td>
              <Td>
                <Select
                  aria-label={`Role of ${row.name}`}
                  className="min-w-36"
                  value={row.role}
                  onValueChange={(v) => onEdit(row.assetId, { role: v as FileRole })}
                  disabled={processing || roles.length < 2}
                  options={withCurrent(
                    roles.map((r) => ({ value: r as string, label: ROLE_LABELS[r] })),
                    row.role
                  )}
                />
              </Td>
              <Td>
                <div className="flex min-w-56 flex-col items-start gap-1.5">
                  <SearchSelect
                    aria-label={`CRS of ${row.name}`}
                    value={row.crs || null}
                    onValueChange={(v) => onEdit(row.assetId, { crs: v })}
                    disabled={processing}
                    placeholder={row.skipReason === null ? "Pick a CRS…" : "Not needed"}
                    searchPlaceholder="Find a CRS"
                    options={crsChoices(row.asset, row.crs).map((o) => ({ ...o, meta: o.value, keywords: [o.value] }))}
                    empty={(query) => `No CRS matches “${query}”.`}
                    className="w-full"
                  />
                  {chip && <StateChip state={chip} />}
                </div>
              </Td>
              <Td>
                <Select
                  aria-label={`Vertical datum of ${row.name}`}
                  value={row.verticalDatum || undefined}
                  onValueChange={(v) => onEdit(row.assetId, { verticalDatum: v })}
                  disabled={processing}
                  placeholder="Not set"
                  options={withCurrent(VDATUM_OPTIONS, row.verticalDatum)}
                />
              </Td>
            </Tr>
          );
        })}
      </TBody>
    </Table>
  );
}
