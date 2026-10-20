"use client";

import { Chip } from "@puckoops/camelot";
import Link from "next/link";
import { useState } from "react";
import type { Overview, RegisterRow } from "@/lib/api/mm";

export const STAGES = [
  { key: "application", label: "Application" },
  { key: "dgps", label: "DGPS" },
  { key: "drone", label: "Drone survey" },
  { key: "analysis", label: "Analysis" },
  { key: "report", label: "Report" },
  { key: "vetted", label: "Vetted" },
];

const TONE = { info: "blue", warn: "amber", bad: "red" } as const;
const SHOWN = 3;

/** Above a minor-minerals workspace's sites: how many leases stand at each stage, each a filter of the list, and what
 * waits on someone. */
export function MMSitesHeader({
  rows,
  attention,
  stage,
  onStage,
}: {
  rows: RegisterRow[];
  attention: Overview["attention"];
  stage: string | null;
  onStage: (stage: string | null) => void;
}) {
  const [all, setAll] = useState(false);
  const count = (key: string) => rows.filter((r) => r.current_stage === key).length;
  const shown = all ? attention : attention.slice(0, SHOWN);

  return (
    <div className="flex flex-col gap-4 px-5">
      <div className="grid grid-cols-3 overflow-hidden rounded-md border border-hairline" role="group" aria-label="Leases by stage">
        {STAGES.map((s, i) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={stage === s.key}
            onClick={() => onStage(stage === s.key ? null : s.key)}
            className={`flex flex-col gap-0.5 px-3 py-2 text-left ${i % 3 !== 2 ? "border-r" : ""} ${i < 3 ? "border-b" : ""} border-hairline ${
              stage === s.key ? "bg-emphasis-quiet" : "bg-surface hover:bg-surface-2"
            }`}
          >
            <span className="caption uppercase tracking-wide text-ink-4">{i + 1}</span>
            <span className="caption truncate text-ink-2">{s.label}</span>
            <span className="num-sm text-ink-1">{count(s.key)}</span>
          </button>
        ))}
      </div>
      {attention.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="caps text-4">Needs attention</p>
          <ul className="flex flex-col gap-2">
            {shown.map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-2">
                <Link href={a.link} className="small min-w-0 text-ink-2 hover:underline">
                  <span className="block truncate font-medium text-ink-1">{a.lease_name}</span>
                  <span className="caption block text-ink-3">{a.item}</span>
                </Link>
                <Chip tone={TONE[a.tone]} glyph={a.tone === "bad" ? "cross" : a.tone === "warn" ? "triangle" : "circle-half"}>
                  {a.label}
                </Chip>
              </li>
            ))}
          </ul>
          {attention.length > SHOWN && (
            <button type="button" className="caption self-start text-ink-3 hover:underline" onClick={() => setAll(!all)}>
              {all ? "Show fewer" : `${attention.length - SHOWN} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
