"use client";

import type { ReactNode } from "react";
import type { Graph, NodeStyle } from "@/lib/upload/pipelineGraph";

const NODE_STYLES: Record<NodeStyle, string> = {
  up: "border border-control bg-surface text-ink-1",
  done: "border-[1.5px] border-ink-1 bg-surface text-ink-1",
  made: "tint-blue border",
  ready: "tint-teal border",
  skip: "border border-dashed border-hairline-strong text-ink-4",
  site: "border border-hairline-strong bg-surface-3 text-ink-1",
  warn: "tint-amber border border-dashed",
};

const LEGEND: { style: NodeStyle; label: string }[] = [
  { style: "up", label: "You upload" },
  { style: "made", label: "Runs" },
  { style: "site", label: "From the site" },
  { style: "skip", label: "Skipped" },
];

/**
 * The pipeline an upload builds, drawn from a graph spec: nodes placed where the spec says, the edges between them
 * in one layer underneath, solid where data flows and dashed where it doesn't. It reads the form and has no
 * controls of its own.
 */
export function PipelineGraph({
  graph,
  label,
  siteLabel = "From the site",
  children,
}: {
  graph: Graph;
  label: string;
  siteLabel?: string;
  children?: ReactNode;
}) {
  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-3 rounded-lg border border-hairline bg-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="small font-medium text-ink-1">Pipeline</h3>
        <ul className="flex flex-wrap gap-1.5" aria-label="Legend">
          {LEGEND.map((l) => (
            <li key={l.style} className={`rounded-md px-1.5 text-[11.5px] leading-[18px] font-medium ${NODE_STYLES[l.style]}`}>
              {l.style === "site" ? siteLabel : l.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-x-auto">
        <div className="relative" style={{ width: graph.width, height: graph.height }}>
          {graph.group && (
            <div className="absolute rounded-lg border border-dashed border-hairline-strong" style={{ left: graph.group.x, top: graph.group.y, width: graph.group.w, height: graph.group.h }}>
              <span className="font-mono absolute left-3 top-1.5 text-[10px] tracking-wider text-ink-3">{graph.group.label}</span>
            </div>
          )}
          <svg className="pointer-events-none absolute inset-0" width={graph.width} height={graph.height} aria-hidden="true">
            <defs>
              <marker id="pipeline-on" viewBox="0 0 4 4" refX="3" refY="2" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M0,0 L4,2 L0,4 z" className="fill-ink-2" />
              </marker>
              <marker id="pipeline-off" viewBox="0 0 4 4" refX="3" refY="2" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M0,0 L4,2 L0,4 z" className="fill-[var(--color-hairline-strong)]" />
              </marker>
            </defs>
            {graph.edges.map((e) => (
              <polyline
                key={e.id}
                points={e.points.map(([x, y]) => `${x},${y}`).join(" ")}
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray={e.on ? undefined : "4 4"}
                className={e.on ? "stroke-ink-2" : "stroke-[var(--color-hairline-strong)]"}
                markerEnd={e.arrow ? `url(#pipeline-${e.on ? "on" : "off"})` : undefined}
              />
            ))}
          </svg>
          {graph.headers.map((h) => (
            <span key={h.text} className="font-mono absolute text-[10px] font-medium tracking-wider text-ink-3" style={{ left: h.x, top: h.y, width: h.w }}>
              {h.text}
            </span>
          ))}
          {graph.nodes.map((n) => (
            <div
              key={n.id}
              className={`absolute flex flex-col items-center justify-center overflow-hidden rounded-lg px-1.5 py-1 text-center text-[12px] leading-[15px] ${NODE_STYLES[n.style]}`}
              style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
            >
              <span className="font-semibold">{n.title}</span>
              {n.sub && <span className="text-[11px] leading-[14px]">{n.sub}</span>}
            </div>
          ))}
        </div>
      </div>
      {children && <div className="caption border-t border-hairline pt-2.5 text-ink-2">{children}</div>}
    </section>
  );
}
