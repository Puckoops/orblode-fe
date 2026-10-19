"use client";

import { Download01Icon, Upload01Icon } from "@hugeicons/core-free-icons";
import { Button, Chip, IconButton } from "@puckoops/camelot";
import { useRef, useState } from "react";
import { refusalMessage } from "@/lib/api/client";
import { documentLink, uploadLeaseDocument, type LeaseDetail } from "@/lib/api/mm";
import { bytes } from "@/lib/mm/format";
import { toast } from "@/lib/toast";

/** The application's document checklist: each item done once its file is uploaded; the boundary item is done
 * by setting the boundary. */
export function Documents({ lease, editable, onChange }: { lease: LeaseDetail; editable: boolean; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const docs = lease.documents ?? [];

  const pick = (k: string) => {
    setKind(k);
    input.current?.click();
  };

  const upload = async (file: File) => {
    if (!kind) return;
    setBusy(kind);
    try {
      await uploadLeaseDocument(lease.id, kind, file);
      toast.success(`${file.name} uploaded.`);
      onChange();
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't upload the file. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const open = async (id: string) => {
    try {
      window.open((await documentLink(id)).url, "_blank", "noopener");
    } catch (err) {
      toast.error(refusalMessage(err, "Couldn't open the file."));
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
      <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
        {lease.checklist.map((item, i) => {
          const files = docs.filter((d) => d.kind === item.key && d.status === "uploaded");
          const done = Boolean(item.document_id);
          return (
            <li key={item.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[12px] font-semibold ${
                  done ? "border-[var(--color-teal-500,#2e7d4f)] bg-[var(--color-teal-500,#2e7d4f)] text-white" : "border-hairline text-ink-4"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="small block text-ink-1">
                  {item.label}
                  {item.required && !done && (
                    <Chip tone="amber" glyph="triangle" className="ml-2">
                      Needed
                    </Chip>
                  )}
                </span>
                {item.hint && <span className="caption block text-ink-4">{item.hint}</span>}
                {files.map((f) => (
                  <span key={f.id} className="caption mt-1 flex items-center gap-1 text-ink-3">
                    {f.name} · {bytes(f.size)}
                    <IconButton icon={Download01Icon} aria-label={`Download ${f.name}`} variant="bare" size="sm" onClick={() => void open(f.id)} />
                  </span>
                ))}
              </span>
              {editable && item.key !== "boundary" && (
                <Button variant="ghost" size="sm" iconStart={Upload01Icon} loading={busy === item.key} onClick={() => pick(item.key)}>
                  {files.length ? "Add another" : "Upload"}
                </Button>
              )}
              {item.key === "boundary" && <span className="caption text-ink-4">{done ? "Set from the boundary file" : "Set the boundary above"}</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
