import type { PointCloud } from "@/lib/landing/cloud";
import type { Job, JobKind, JobResults } from "@/lib/landing/compute";
import { frameFor, heightOn } from "@/lib/landing/grid";
import { SAMPLE_FRAME, type SceneFrame, type SiteInfo } from "@/lib/landing/site";
import type { SurveyScene } from "@/lib/landing/survey";
import { sample } from "@/lib/landing/terrain";
import { isCoarsePointer } from "../env";

type Pending = { job: Job; resolve: (value: unknown) => void; reject: (reason: Error) => void };
type Reply = { id: number; result?: unknown; error?: string };

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

const runInline = (job: Job) => import("@/lib/landing/compute").then((m) => m.runJob(job)).then((r) => r.result);

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

/** What the 3D views draw: the cloud, how to frame it, ground heights, and the real survey's pictures when there is one. */
export type Scene = {
  cloud: PointCloud;
  frame: SceneFrame;
  heightAt: (x: number, y: number) => number;
  survey: SurveyScene | null;
};

let scene: Promise<Scene> | null = null;

/** The site's scene, built once and shared by every view on the page. */
export function loadScene(site: SiteInfo): Promise<Scene> {
  if (scene) return scene;
  const detail = isCoarsePointer() ? "light" : "full";
  if (site.source) {
    scene = compute({ kind: "survey", source: site.source, origin: site.origin, detail, base: window.location.origin }).then((survey) => ({
      cloud: survey.cloud,
      frame: frameFor(survey.grid, site.featured),
      heightAt: (x: number, y: number) => heightOn(survey.grid, x, y),
      survey,
    }));
    scene.catch((err) => console.warn("[landing] the showcase survey could not be drawn:", err));
  } else {
    scene = compute({ kind: "cloud", detail }).then((cloud) => ({ cloud, frame: SAMPLE_FRAME, heightAt: (x: number, y: number) => sample(x, y).z, survey: null }));
  }
  return scene;
}
