import type { PointCloud } from "@/lib/landing/cloud";
import type { Job, JobKind, JobResults } from "@/lib/landing/compute";
import { isCoarsePointer } from "./env";

type Pending = { job: Job; resolve: (value: unknown) => void; reject: (reason: Error) => void };
type Reply = { id: number; result?: unknown; error?: string };

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

const runInline = (job: Job) => import("@/lib/landing/compute").then((m) => m.runJob(job).result);

function connect(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./terrain.worker.ts", import.meta.url));
  } catch {
    worker = null;
    return worker;
  }
  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.error) entry.reject(new Error(data.error));
    else entry.resolve(data.result);
  };
  // A worker that fails to load takes its queue with it; the jobs still finish on the main thread.
  worker.onerror = () => {
    worker?.terminate();
    worker = null;
    for (const entry of pending.values()) runInline(entry.job).then(entry.resolve, entry.reject);
    pending.clear();
  };
  return worker;
}

/** Runs a terrain job in the shared worker, or on the main thread where workers are unavailable. */
export function compute<K extends JobKind>(job: Extract<Job, { kind: K }>): Promise<JobResults[K]> {
  const w = connect();
  if (!w) return runInline(job) as Promise<JobResults[K]>;
  const id = nextId++;
  return new Promise<JobResults[K]>((resolve, reject) => {
    pending.set(id, { job, resolve: resolve as (value: unknown) => void, reject });
    w.postMessage({ id, job });
  });
}

let cloud: Promise<PointCloud> | null = null;

/** The sample site's point cloud, built once and shared by every view on the page. */
export const loadCloud = () => (cloud ??= compute({ kind: "cloud", detail: isCoarsePointer() ? "light" : "full" }));
