"use client";

// `designs` module — the project's designs and their surfaces: whether each has
// been rasterized for cut/fill (orblode-svc's design-surface processing), why it
// failed when it did, and a way to process it again. Refreshes on its own while
// any surface is still processing.

import { useEffect, useState } from "react";
import { DraftingCompassIcon } from "@hugeicons/core-free-icons";
import { Badge, Button, Chip, EmptyState, HelperText } from "@puckoops/camelot";

import { Loader } from "@/components/brand/Loader";
import { processDesign, type DesignRecord } from "@/lib/api/orblodeSvc";
import { stripErrNamespace } from "@/lib/api/errors";
import { toast } from "@/lib/toast";
import { useProjectDesigns } from "@/components/viewer/shell/hooks/useProjectDesigns";

const POLL_MS = 10_000;

function SurfaceChip({ design }: { design: DesignRecord }) {
  switch (design.surface?.status) {
    case "ready":
      return (
        <Chip tone="teal" glyph="check">
          Ready
        </Chip>
      );
    case "processing":
      return (
        <Chip tone="blue" glyph="circle-half">
          Processing
        </Chip>
      );
    case "failed":
      return (
        <Chip tone="red" glyph="triangle">
          Failed
        </Chip>
      );
    default:
      return (
        <Chip tone="neutral" glyph="circle-dashed">
          Not processed
        </Chip>
      );
  }
}

export function DesignsPanel({ projectId }: { projectId: string }) {
  const { designs, reload } = useProjectDesigns(projectId);
  const [busy, setBusy] = useState<string | null>(null);
  const processing = designs?.some((d) => d.surface?.status === "processing") ?? false;

  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [processing, reload]);

  const process = async (design: DesignRecord) => {
    setBusy(design.id);
    try {
      const out = await processDesign(design.id);
      if (out.surface?.status === "failed") {
        toast.warning(`Can't process ${design.name}: ${out.surface.error ?? "unknown reason"}`);
      } else {
        toast.info(`Processing ${design.name}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? stripErrNamespace(err.message) : "The design could not be processed.");
    } finally {
      setBusy(null);
      reload();
    }
  };

  if (designs === null) return <Loader label="Loading designs" />;
  if (designs.length === 0) {
    return (
      <EmptyState
        icon={DraftingCompassIcon}
        title="No designs yet"
        description="Upload a LandXML, DXF, OBJ or GeoJSON design to compare cut and fill against it."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2 p-3">
      {designs.map((d) => (
        <li key={d.id} className="flex flex-col gap-2 rounded-md border border-hairline bg-surface p-2.5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-ink-1">{d.name}</span>
            <Badge variant="tag">{d.format.toUpperCase()}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <SurfaceChip design={d} />
            {d.surface?.status === "ready" && d.surface.method === "linear_from_vertices" && (
              <span className="caption text-ink-4">from points, no breaklines</span>
            )}
          </div>
          {d.surface?.status === "failed" && d.surface.error && <HelperText tone="error">{d.surface.error}</HelperText>}
          {d.surface?.status !== "processing" && (
            <Button variant="ghost" size="sm" className="self-start" disabled={busy === d.id} onClick={() => void process(d)}>
              {d.surface?.status === "ready" ? "Process again" : "Process"}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
