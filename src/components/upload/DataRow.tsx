"use client";

import { Checkbox, Progress } from "@puckoops/camelot";
import { useId, type ReactNode } from "react";

export interface RowFile {
  name: string;
  size?: string;
  /** 0–100 while uploading; absent once done or before it starts. */
  percent?: number;
  done?: boolean;
}

/**
 * One kind of data the upload has: ticked when the person has it, with what it is for, the files they gave for it and
 * how far each has gone up. A fixed row is always part of the upload.
 */
export function DataRow({
  title,
  description,
  checked,
  fixed,
  disabled,
  onToggle,
  action,
  files = [],
  children,
}: {
  title: string;
  description: ReactNode;
  checked: boolean;
  fixed?: boolean;
  disabled?: boolean;
  onToggle?: (checked: boolean) => void;
  action?: ReactNode;
  files?: RowFile[];
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-2 rounded-lg bg-surface px-3 py-2.5 ${checked ? "border-[1.5px] border-ink-1" : "border border-hairline"}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <Checkbox id={id} checked={checked} disabled={fixed || disabled} onCheckedChange={(v) => onToggle?.(v)} />
            <label htmlFor={id} className="small font-medium text-ink-1">
              {title}
            </label>
          </div>
          <p className="caption mt-0.5 pl-7 text-ink-3">{description}</p>
        </div>
        {checked && action && <div className="shrink-0">{action}</div>}
      </div>
      {checked &&
        files.map((f) => (
          <div key={f.name} className="flex flex-col gap-1 pl-7">
            <span className={`font-mono text-xs ${f.done ? "text-ink-1" : "text-ink-2"}`}>
              {f.done ? `✓ ${f.name}${f.size ? ` · ${f.size}` : ""}` : f.percent !== undefined ? `Uploading ${f.name} · ${Math.round(f.percent)}%` : `${f.name}${f.size ? ` · ${f.size}` : ""}`}
            </span>
            {(f.percent !== undefined || f.done) && <Progress value={f.done ? 100 : Math.round(f.percent ?? 0)} size="thin" aria-label={`${f.name} upload`} />}
          </div>
        ))}
      {checked && children && <div className="pl-7">{children}</div>}
    </div>
  );
}
