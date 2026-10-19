"use client";

import { Skeleton } from "@puckoops/camelot";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { useCesiumReady } from "@/hooks/useCesiumReady";

const MMMap = dynamic(() => import("./MMMap").then((m) => m.MMMap), { ssr: false });

/** MMMap once Cesium has loaded: its module resolves the `cesium` global when it is evaluated. */
export function LazyMap(props: ComponentProps<typeof MMMap>) {
  const ready = useCesiumReady();
  return ready ? <MMMap {...props} /> : <Skeleton height={props.height ?? 520} />;
}
